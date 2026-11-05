"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { decimal, text } from "@/lib/form";
import { anaPurchasePatch, pdfInvoice } from "@/lib/integracao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function finish(error?: string, situacao?: string): never {
  revalidatePath("/integracao/compras");
  const params = new URLSearchParams();
  if (error) params.set("erro", error);
  else params.set("ok", "1");
  if (situacao) params.set("situacao", situacao);
  redirect(`/integracao/compras?${params.toString()}`);
}

function listFor(purchased: boolean, paymentDate: string | null) {
  if (!purchased) return "abertas";
  return paymentDate ? "pagas" : "compradas";
}

async function visibleOrder(id: string) {
  const [order] = await db()<{
    id: string;
    origin: string | null;
    order_key: string;
    product_name: string | null;
    supplier_name: string | null;
    supplier_ref: string | null;
    purchase_currency: string | null;
    purchase_foreign_amount: number | string | null;
    purchased: boolean;
    payment_date: string | null;
  }[]>`
    select o.id, o.origin, o.order_key, o.product_name, o.supplier_name, o.supplier_ref,
      o.purchase_currency, o.purchase_foreign_amount, o.purchased, o.payment_date
    from ctl_integration_purchase_requests r
    join ctl_orders o on o.id = r.order_id
    where o.id = ${id}
    limit 1
  `;
  if (!order) return null;
  return order;
}

export async function updateAnaPurchase(formData: FormData) {
  await requireOperator();
  const id = text(formData, "id") ?? "";
  if (!UUID.test(id) || !(await visibleOrder(id))) finish("Este pedido não está na lista da Ana.");
  const purchased = String(formData.get("purchased") ?? "");
  if (purchased !== "true" && purchased !== "false") finish("Informe se o relógio foi comprado.");
  const saved = anaPurchasePatch({
    purchased: purchased === "true",
    supplierName: text(formData, "supplier_name"),
    supplierRef: text(formData, "supplier_ref"),
    supplierPurchaseDate: text(formData, "supplier_purchase_date"),
    currency: text(formData, "purchase_currency"),
    foreignAmount: decimal(formData, "purchase_foreign_amount"),
    paymentDate: text(formData, "payment_date"),
  });
  if (!saved.ok) finish("Confira valor, moeda e datas.");
  const patch = saved.patch;
  try {
    await db()`
      update ctl_orders set
        purchased = ${patch.purchased},
        supplier_name = ${patch.supplier_name},
        supplier_ref = ${patch.supplier_ref},
        supplier_purchase_date = ${patch.supplier_purchase_date},
        purchase_currency = ${patch.purchase_currency},
        purchase_foreign_amount = ${patch.purchase_foreign_amount},
        payment_date = ${patch.payment_date}
      where id = ${id}
    `;
  } catch {
    finish("Não foi possível salvar a compra.");
  }
  finish(undefined, listFor(patch.purchased, patch.payment_date));
}

export async function attachAnaInvoice(formData: FormData) {
  await requireOperator();
  const id = text(formData, "id") ?? "";
  const order = UUID.test(id) ? await visibleOrder(id) : null;
  if (!order) finish("Este pedido não está na lista da Ana.");
  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0 || file.size > 8 * 1024 * 1024) finish("Anexe um PDF de até 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!pdfInvoice(bytes, bytes.byteLength)) finish("O arquivo precisa ser um PDF.");
  const supplier = text(formData, "supplier_name") || order.supplier_name;
  const invoiceNumber = text(formData, "invoice_number");
  const invoiceDate = text(formData, "invoice_date");
  if (invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) finish("Data da fatura inválida.");
  const typedAmount = decimal(formData, "amount");
  const fallbackAmount = order.purchase_foreign_amount == null ? null : Number(order.purchase_foreign_amount);
  const amount = typedAmount ?? (fallbackAmount != null && Number.isFinite(fallbackAmount) ? fallbackAmount : null);
  const currency = (text(formData, "currency") || order.purchase_currency || "EUR").toUpperCase();
  if (!["EUR", "USD", "GBP", "CHF", "BRL"].includes(currency)) finish("Moeda da fatura não aceita.");
  const filename = safeFileName(file.name);

  try {
    await db().begin(async (sql) => {
      const existing = invoiceNumber ? await sql<{ id: string; status: string; has_document: boolean }[]>`
        select id, status, document is not null as has_document
        from ctl_supplier_invoices
        where lower(invoice_number) = lower(${invoiceNumber})
          and lower(coalesce(supplier_name, '')) = lower(${supplier ?? ""})
        order by created_at desc
        limit 1
      ` : [];
      const alreadyLinked = existing[0] ? await sql<{ id: string }[]>`
        select k.id
        from ctl_supplier_invoice_links k
        join ctl_supplier_invoice_lines l on l.id = k.line_id
        where l.invoice_id = ${existing[0].id} and k.order_id = ${order.id}
        limit 1
      ` : [];
      const reuse = existing[0] && (alreadyLinked[0] || existing[0].status !== "confirmado") ? existing[0] : undefined;
      if (!reuse) {
        const inserted = await sql<{ id: string }[]>`
          insert into ctl_supplier_invoices (
            supplier_name, invoice_number, invoice_date, currency, total_amount, template, status,
            draft_document, source_filename, document, document_type, warning
          ) values (
            ${supplier}, ${invoiceNumber}, ${invoiceDate}, ${currency}, ${amount}, 'anexo', 'rascunho',
            false, ${filename}, ${Buffer.from(bytes)}, 'application/pdf',
            ${"Anexada na Plataforma Europa. A confirmação em Pagamentos grava o custo em reais."}
          )
          returning id
        `;
        const invoiceId = inserted[0]?.id;
        if (!invoiceId) throw new Error("sem fatura");
        const line = await sql<{ id: string }[]>`
          insert into ctl_supplier_invoice_lines (
            invoice_id, line_no, kind, description, reference, order_key, quantity, unit_amount, line_amount
          ) values (
            ${invoiceId}, 1, 'produto', ${order.product_name}, ${order.supplier_ref}, ${order.order_key},
            1, ${amount}, ${amount}
          )
          returning id
        `;
        if (!line[0]) throw new Error("sem linha");
        await sql`
          insert into ctl_supplier_invoice_links (line_id, order_id, reason)
          values (${line[0].id}, ${order.id}, 'anexo')
        `;
      } else if (!reuse.has_document || !alreadyLinked[0]) {
        if (!reuse.has_document) {
          await sql`
            update ctl_supplier_invoices
            set document = ${Buffer.from(bytes)}, document_type = 'application/pdf', source_filename = coalesce(source_filename, ${filename})
            where id = ${reuse.id}
          `;
        }
        if (!alreadyLinked[0]) {
          const next = await sql<{ line_no: number }[]>`
            select coalesce(max(line_no), 0) + 1 as line_no
            from ctl_supplier_invoice_lines
            where invoice_id = ${reuse.id}
          `;
          const line = await sql<{ id: string }[]>`
            insert into ctl_supplier_invoice_lines (
              invoice_id, line_no, kind, description, reference, order_key, quantity, unit_amount, line_amount
            ) values (
              ${reuse.id}, ${next[0]?.line_no ?? 1}, 'produto', ${order.product_name}, ${order.supplier_ref},
              ${order.order_key}, 1, ${amount}, ${amount}
            )
            returning id
          `;
          if (!line[0]) throw new Error("sem linha");
          await sql`
            insert into ctl_supplier_invoice_links (line_id, order_id, reason)
            values (${line[0].id}, ${order.id}, 'anexo')
            on conflict (line_id, order_id) do nothing
          `;
        }
      }
      if (supplier && !order.supplier_name) {
        await sql`update ctl_orders set supplier_name = ${supplier} where id = ${order.id} and supplier_name is null`;
      }
    });
  } catch {
    finish("Não foi possível anexar a fatura.");
  }
  finish(undefined, listFor(order.purchased, order.payment_date));
}

function safeFileName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? "fatura.pdf";
  const clean = base.replace(/[^\w.\- ()]+/g, "").slice(0, 180);
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean || "fatura"}.pdf`;
}
