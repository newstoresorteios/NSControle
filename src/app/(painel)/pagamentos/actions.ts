"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { decimal, text } from "@/lib/form";
import { interpretInvoice } from "@/lib/invoice-ai";
import { suggestInvoice } from "@/lib/invoice-match";
import { candidateOrders } from "@/lib/invoice-orders";
import { parseInvoice, type ParsedInvoice } from "@/lib/invoice-parse";
import { pdfToText } from "@/lib/invoice-pdf";

const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadInvoice(formData: FormData) {
  await requireTeam();
  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) redirect("/pagamentos?erro=arquivo");
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") redirect("/pagamentos?erro=arquivo");

  let raw = "";
  try {
    raw = await pdfToText(new Uint8Array(await file.arrayBuffer()));
  } catch {
    redirect("/pagamentos?erro=ler");
  }
  if (raw.length < 20) redirect("/pagamentos?erro=texto");

  const parsed = await readInvoice(raw);
  if (parsed.invoiceNumber) {
    const existing = await db()<{ id: string }[]>`
      select id
      from ctl_supplier_invoices
      where lower(invoice_number) = lower(${parsed.invoiceNumber})
        and lower(coalesce(supplier_name, '')) = lower(${parsed.supplierName ?? ""})
      order by created_at desc
      limit 1
    `;
    if (existing[0]) redirect(`/pagamentos/${existing[0].id}?aviso=ja-existe`);
  }

  const suggestions = suggestInvoice(parsed.lines, await candidateOrders(parsed.lines));
  let invoiceId = "";
  try {
    invoiceId = await db().begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into ctl_supplier_invoices (
          supplier_name, bill_to, invoice_number, invoice_date, currency, total_amount,
          payment_method, bank_name, iban, swift, beneficiary, due_date, due_amount,
          template, status, draft_document, source_filename, raw_text, warning
        ) values (
          ${parsed.supplierName}, ${parsed.billTo}, ${parsed.invoiceNumber}, ${parsed.invoiceDate},
          ${parsed.currency || "EUR"}, ${parsed.totalAmount}, ${parsed.paymentMethod}, ${parsed.bankName},
          ${parsed.iban}, ${parsed.swift}, ${parsed.beneficiary}, ${parsed.dueDate}, ${parsed.dueAmount},
          ${parsed.template}, 'rascunho', ${parsed.draft}, ${file.name.slice(0, 200)},
          ${raw.slice(0, 100_000)}, ${parsed.warning}
        )
        returning id
      `;
      const id = rows[0]?.id;
      if (!id) throw new Error("sem id");
      for (let index = 0; index < parsed.lines.length; index += 1) {
        const line = parsed.lines[index];
        const inserted = await tx<{ id: string }[]>`
          insert into ctl_supplier_invoice_lines (
            invoice_id, line_no, kind, description, reference, order_key, quantity, unit_amount, line_amount
          ) values (
            ${id}, ${index + 1}, ${line.kind}, ${line.description}, ${line.reference}, ${line.orderKey},
            ${line.quantity}, ${line.unitAmount}, ${line.lineAmount}
          )
          returning id
        `;
        const lineId = inserted[0]?.id;
        if (!lineId) continue;
        for (const orderId of suggestions[index]?.orderIds ?? []) {
          await tx`
            insert into ctl_supplier_invoice_links (line_id, order_id, reason)
            values (${lineId}, ${orderId}, 'sugerido')
          `;
        }
      }
      return id;
    });
  } catch {
    redirect("/pagamentos?erro=salvar");
  }

  revalidatePath("/pagamentos");
  redirect(`/pagamentos/${invoiceId}`);
}

export async function saveInvoice(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id");
  if (!isUuid(id)) redirect("/pagamentos");
  const intent = text(formData, "intent") ?? "rascunho";
  const sql = db();
  const existing = await sql<{ status: string }[]>`
    select status from ctl_supplier_invoices where id = ${id} limit 1
  `;
  if (!existing[0]) redirect("/pagamentos");

  const known = await sql<StoredLine[]>`
    select id, kind, quantity
    from ctl_supplier_invoice_lines
    where invoice_id = ${id}
  `;
  const byId = new Map(known.map((line) => [line.id, line]));
  const drafts: DraftLine[] = [];
  const missing: string[] = [];
  const ambiguous: string[] = [];

  for (const lineId of formData.getAll("line_id").map(String)) {
    if (!isUuid(lineId) || !byId.has(lineId)) continue;
    const current = byId.get(lineId);
    if (!current) continue;
    const orderIds = new Set(formData.getAll(`link_${lineId}`).map(String).filter(isUuid));
    const extra = text(formData, `extra_${lineId}`);
    if (intent !== "religar" && current.kind !== "taxa" && extra) {
      if (!/^\d+$/.test(extra)) missing.push(extra);
      else {
        const hits = await sql<{ id: string; total: number }[]>`
          select id, (count(*) over ())::int as total
          from ctl_orders
          where order_key = ${extra}
          order by updated_at desc nulls last
          limit 1
        `;
        if (!hits[0]) missing.push(extra);
        else {
          orderIds.add(hits[0].id);
          if (hits[0].total > 1) ambiguous.push(extra);
        }
      }
    }
    drafts.push({
      id: lineId,
      kind: current.kind,
      reference: text(formData, `ref_${lineId}`),
      orderKey: digits(text(formData, `key_${lineId}`)),
      quantity: current.quantity == null ? null : Number(current.quantity),
      orderIds: current.kind === "taxa" ? [] : [...orderIds],
    });
  }

  if (intent === "religar") {
    const suggestions = suggestInvoice(drafts, await candidateOrders(drafts));
    drafts.forEach((line, index) => {
      line.orderIds = line.kind === "taxa" ? [] : (suggestions[index]?.orderIds ?? []);
    });
  }

  const wanted = [...new Set(drafts.flatMap((line) => line.orderIds))];
  if (wanted.length) {
    const valid = await sql<{ id: string }[]>`
      select id from ctl_orders where id::text = any(${wanted})
    `;
    const ids = new Set(valid.map((row) => row.id));
    for (const line of drafts) line.orderIds = line.orderIds.filter((orderId) => ids.has(orderId));
  }

  let status = existing[0].status;
  if (intent === "rascunho") status = "rascunho";
  if (intent === "confirmar" && !missing.length) status = "confirmado";

  const previous = await sql<{ order_id: string }[]>`
    select k.order_id
    from ctl_supplier_invoice_links k
    join ctl_supplier_invoice_lines l on l.id = k.line_id
    where l.invoice_id = ${id} and k.order_id is not null
  `;

  try {
    await sql.begin(async (tx) => {
      await tx`
        update ctl_supplier_invoices set
          supplier_name = ${text(formData, "supplier_name")},
          bill_to = ${text(formData, "bill_to")},
          invoice_number = ${text(formData, "invoice_number")},
          invoice_date = ${dateOrNull(text(formData, "invoice_date"))},
          currency = ${currencyOf(text(formData, "currency"))},
          total_amount = ${decimal(formData, "total_amount")},
          payment_method = ${text(formData, "payment_method")},
          bank_name = ${text(formData, "bank_name")},
          iban = ${text(formData, "iban")},
          swift = ${text(formData, "swift")},
          beneficiary = ${text(formData, "beneficiary")},
          due_date = ${dateOrNull(text(formData, "due_date"))},
          due_amount = ${decimal(formData, "due_amount")},
          status = ${status}
        where id = ${id}
      `;
      await tx`
        delete from ctl_supplier_invoice_links
        where line_id in (select id from ctl_supplier_invoice_lines where invoice_id = ${id})
      `;
      for (const line of drafts) {
        await tx`
          update ctl_supplier_invoice_lines
          set reference = ${line.reference}, order_key = ${line.orderKey}
          where id = ${line.id} and invoice_id = ${id}
        `;
        for (const orderId of line.orderIds) {
          await tx`
            insert into ctl_supplier_invoice_links (line_id, order_id, reason)
            values (${line.id}, ${orderId}, ${intent === "religar" ? "sugerido" : "confirmado"})
            on conflict (line_id, order_id) do nothing
          `;
        }
      }
    });
  } catch {
    redirect(`/pagamentos/${id}?erro=salvar`);
  }

  revalidatePath("/pagamentos");
  revalidatePath(`/pagamentos/${id}`);
  const touched = new Set<string>([
    ...previous.map((row) => row.order_id),
    ...drafts.flatMap((line) => line.orderIds),
  ]);
  for (const orderId of touched) revalidatePath(`/pedidos/${orderId}`);

  if (missing.length) {
    redirect(`/pagamentos/${id}?erro=pedido&qual=${encodeURIComponent(missing.join(", "))}`);
  }
  if (ambiguous.length) {
    redirect(`/pagamentos/${id}?aviso=fichas&qual=${encodeURIComponent(ambiguous.join(", "))}`);
  }
  redirect(`/pagamentos/${id}?ok=1`);
}

export async function deleteInvoice(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id");
  if (!isUuid(id)) redirect("/pagamentos");
  const sql = db();
  const previous = await sql<{ order_id: string }[]>`
    select k.order_id
    from ctl_supplier_invoice_links k
    join ctl_supplier_invoice_lines l on l.id = k.line_id
    where l.invoice_id = ${id} and k.order_id is not null
  `;
  await sql`delete from ctl_supplier_invoices where id = ${id}`;
  revalidatePath("/pagamentos");
  for (const row of previous) revalidatePath(`/pedidos/${row.order_id}`);
  redirect("/pagamentos");
}

async function readInvoice(raw: string): Promise<ParsedInvoice> {
  const parsed = parseInvoice(raw);
  if (parsed.template !== "desconhecido") return parsed;
  const ai = await interpretInvoice(raw);
  if (ai) return ai;
  if (!process.env.INVOICE_AI_KEY?.trim()) {
    return {
      ...parsed,
      warning:
        "Layout não reconhecido. Edjouse, Pesci e CA são lidos no código. Para outro fornecedor, configure INVOICE_AI_KEY.",
    };
  }
  return { ...parsed, warning: "A IA não conseguiu ler esta fatura. O texto extraído está na ficha." };
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function digits(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return value;
}

function dateOrNull(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function currencyOf(value: string | null): string {
  return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : "EUR";
}

type StoredLine = {
  id: string;
  kind: string;
  quantity: number | string | null;
};

type DraftLine = {
  id: string;
  kind: string;
  reference: string | null;
  orderKey: string | null;
  quantity: number | null;
  orderIds: string[];
};
