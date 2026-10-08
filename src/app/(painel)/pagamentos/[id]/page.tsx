import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteInvoice, saveInvoice } from "@/app/(painel)/pagamentos/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { FLOW_LABEL, asNumber, money } from "@/lib/format";
import { suggestInvoice, type OrderHit } from "@/lib/invoice-match";
import { candidateOrders } from "@/lib/invoice-orders";
import { TEMPLATE_LABEL, type InvoiceTemplate } from "@/lib/invoice-parse";

export default async function PagamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; aviso?: string; qual?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  await requireTeam();
  const sql = db();
  const [found, lines, links] = await Promise.all([
    sql<Invoice[]>`
      select id, supplier_name, bill_to, invoice_number, invoice_date, currency, total_amount,
        payment_method, bank_name, iban, swift, beneficiary, due_date, due_amount,
        template, status, draft_document, source_filename, raw_text, warning
      from ctl_supplier_invoices
      where id = ${id}
      limit 1
    `,
    sql<Line[]>`
      select id, line_no, kind, description, reference, order_key, quantity, unit_amount, line_amount
      from ctl_supplier_invoice_lines
      where invoice_id = ${id}
      order by line_no
    `,
    sql<LinkRow[]>`
      select k.line_id, k.order_id, o.order_key, o.label, o.product_name, o.reference, o.flow, o.purchased, o.updated_at
      from ctl_supplier_invoice_links k
      join ctl_supplier_invoice_lines l on l.id = k.line_id
      left join ctl_orders o on o.id = k.order_id
      where l.invoice_id = ${id} and k.order_id is not null
    `,
  ]);
  const invoice = found[0];
  if (!invoice) notFound();

  const readable = lines.map((line) => ({
    kind: line.kind,
    reference: line.reference,
    orderKey: line.order_key,
    quantity: line.quantity == null ? null : Number(line.quantity),
  }));
  const hits = await candidateOrders(readable);
  const known = new Map<string, OrderHit>(hits.map((order) => [order.id, order]));
  for (const link of links) {
    if (!link.order_id || known.has(link.order_id)) continue;
    known.set(link.order_id, {
      id: link.order_id,
      orderKey: link.order_key ?? "",
      label: link.label,
      productName: link.product_name,
      reference: link.reference,
      supplierRef: null,
      flow: link.flow ?? "",
      purchased: link.purchased ?? false,
      updatedAt: link.updated_at,
    });
  }
  const suggestions = suggestInvoice(readable, [...known.values()]);
  const message = notice(query);

  return (
    <div className="grid gap-5">
      <div>
        <Link href="/pagamentos" className="text-sm text-muted">
          Voltar aos pagamentos
        </Link>
        <h1 className="page-title mt-2">{invoice.invoice_number || invoice.supplier_name || "Fatura"}</h1>
        <p className="text-muted">
          {labelOf(invoice.template)}
          {" · "}
          {invoice.status === "confirmado" ? "Vínculos confirmados" : "Aguardando confirmação"}
          {invoice.draft_document ? " · PDF em rascunho" : ""}
          {invoice.source_filename ? ` · ${invoice.source_filename}` : ""}
        </p>
      </div>
      {message ? <p className={`text-sm ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>{message.text}</p> : null}
      {invoice.warning ? <p className="card text-sm">{invoice.warning}</p> : null}
      <form action={saveInvoice} className="grid gap-5">
        <input type="hidden" name="id" value={invoice.id} />
        <section className="card grid gap-3 md:grid-cols-3">
          <Field label="Fornecedor" name="supplier_name" defaultValue={invoice.supplier_name} />
          <Field label="Cobrado de" name="bill_to" defaultValue={invoice.bill_to} />
          <Field label="Número" name="invoice_number" defaultValue={invoice.invoice_number} />
          <Field label="Emissão" name="invoice_date" type="date" defaultValue={dateInput(invoice.invoice_date)} />
          <Field label="Moeda" name="currency" defaultValue={invoice.currency || "EUR"} />
          <Field label="Total" name="total_amount" defaultValue={invoice.total_amount} />
          <Field label="Vencimento" name="due_date" type="date" defaultValue={dateInput(invoice.due_date)} />
          <Field label="Valor a pagar" name="due_amount" defaultValue={invoice.due_amount} />
          <Field label="Forma" name="payment_method" defaultValue={invoice.payment_method} />
          <Field label="Banco" name="bank_name" defaultValue={invoice.bank_name} />
          <Field label="IBAN" name="iban" defaultValue={invoice.iban} />
          <Field label="SWIFT" name="swift" defaultValue={invoice.swift} />
          <Field label="Beneficiário" name="beneficiary" defaultValue={invoice.beneficiary} />
        </section>
        <section className="card overflow-x-auto">
          {lines.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma linha foi lida neste PDF.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tipo</th>
                  <th>Referência</th>
                  <th>Qtd</th>
                  <th>Unitário</th>
                  <th>Total</th>
                  <th>Pedido na fatura</th>
                  <th>Vínculo</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const suggestion = suggestions[index];
                  const saved = links.filter((link) => link.line_id === line.id && link.order_id);
                  const options = optionsFor(suggestion?.candidates ?? [], saved, known);
                  return (
                    <tr key={line.id}>
                      <td>
                        {line.line_no}
                        <input type="hidden" name="line_id" value={line.id} />
                      </td>
                      <td>{line.kind === "taxa" ? "Taxa" : "Produto"}</td>
                      <td className="min-w-48">
                        {line.kind === "taxa" ? (
                          line.description || "—"
                        ) : (
                          <>
                            <input
                              name={`ref_${line.id}`}
                              aria-label={`Referência da linha ${line.line_no}`}
                              defaultValue={line.reference ?? ""}
                            />
                            {line.description ? <div className="mt-1 text-xs text-muted">{line.description}</div> : null}
                          </>
                        )}
                      </td>
                      <td className="num">{pieces(line.quantity)}</td>
                      <td className="num">{money(line.unit_amount, invoice.currency)}</td>
                      <td className="num">{money(line.line_amount, invoice.currency)}</td>
                      <td className="min-w-32">
                        {line.kind === "taxa" ? (
                          "—"
                        ) : (
                          <input
                            name={`key_${line.id}`}
                            aria-label={`Pedido da linha ${line.line_no}`}
                            defaultValue={line.order_key ?? ""}
                          />
                        )}
                      </td>
                      <td className="min-w-64">
                        {line.kind === "taxa" ? (
                          <p className="text-sm text-muted">{suggestion?.note}</p>
                        ) : (
                          <div className="grid gap-2">
                            {options.map((order) => (
                              <div key={order.id} className="flex items-start justify-between gap-3">
                                <label className="flex items-start gap-2">
                                  <input
                                    className="mt-1"
                                    type="checkbox"
                                    name={`link_${line.id}`}
                                    value={order.id}
                                    defaultChecked={saved.some((link) => link.order_id === order.id)}
                                  />
                                  <span>
                                    {order.orderKey || "Pedido"}
                                    {shortText(order.productName || order.label) ? ` · ${shortText(order.productName || order.label)}` : ""}
                                    <span className="block text-xs text-muted">
                                      {FLOW_LABEL[order.flow] || order.flow || "Pedido"}
                                      {order.purchased ? " · já comprado" : " · em aberto"}
                                    </span>
                                  </span>
                                </label>
                                <Link className="shrink-0 text-sm underline" href={`/pedidos/${order.id}`}>
                                  Abrir
                                </Link>
                              </div>
                            ))}
                            <input
                              name={`extra_${line.id}`}
                              aria-label={`Outro pedido da linha ${line.line_no}`}
                              placeholder="Outro número"
                            />
                            {suggestion?.note ? <p className="text-xs text-muted">{suggestion.note}</p> : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        <p className="text-sm text-muted">
          Confirmar grava o vínculo com o pedido. O valor em euro fica nesta fatura e não altera o custo em reais.
          {lines.some((line) => line.kind === "produto")
            ? " Se corrigir a referência, use Buscar pedidos de novo."
            : ""}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="confirmar">
            Confirmar vínculos
          </button>
          <button type="submit" name="intent" value="rascunho" className="secondary">
            Salvar rascunho
          </button>
          <button type="submit" name="intent" value="religar" className="secondary">
            Buscar pedidos de novo
          </button>
        </div>
      </form>
      {invoice.raw_text ? (
        <details className="card">
          <summary className="section-title">Texto extraído</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{invoice.raw_text}</pre>
        </details>
      ) : null}
      <details className="card">
        <summary className="section-title">Excluir fatura</summary>
        <form action={deleteInvoice} className="mt-3">
          <input type="hidden" name="id" value={invoice.id} />
          <button type="submit" className="secondary">
            Excluir
          </button>
        </form>
      </details>
    </div>
  );
}

function optionsFor(candidates: OrderHit[], saved: LinkRow[], known: Map<string, OrderHit>) {
  const map = new Map<string, OrderHit>();
  for (const order of candidates) map.set(order.id, order);
  for (const link of saved) {
    if (!link.order_id || map.has(link.order_id)) continue;
    const order = known.get(link.order_id);
    if (order) map.set(order.id, order);
  }
  return [...map.values()];
}

function notice(query: { ok?: string; erro?: string; aviso?: string; qual?: string }) {
  const qual = (query.qual ?? "").slice(0, 80);
  if (query.erro === "salvar") return { tone: "danger" as const, text: "Não foi possível salvar." };
  if (query.erro === "pedido") return { tone: "danger" as const, text: `Não encontrei o pedido ${qual}.` };
  if (query.aviso === "ja-existe") {
    return { tone: "ok" as const, text: "Esta fatura já estava no painel. Nada foi duplicado." };
  }
  if (query.aviso === "fichas") {
    return { tone: "ok" as const, text: `O pedido ${qual} tem mais de uma ficha. Vinculei a mais recente.` };
  }
  if (query.ok) return { tone: "ok" as const, text: "Vínculos salvos." };
  return null;
}

function labelOf(template: string) {
  if (template in TEMPLATE_LABEL) return TEMPLATE_LABEL[template as InvoiceTemplate];
  return template;
}

function dateInput(value: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function shortText(value: string | null, max = 72) {
  if (!value) return "";
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function pieces(value: number | string | null) {
  const number = asNumber(value);
  if (number == null) return "—";
  return Number.isInteger(number) ? String(number) : number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} />
    </label>
  );
}

type Invoice = {
  id: string;
  supplier_name: string | null;
  bill_to: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  total_amount: number | string | null;
  payment_method: string | null;
  bank_name: string | null;
  iban: string | null;
  swift: string | null;
  beneficiary: string | null;
  due_date: string | null;
  due_amount: number | string | null;
  template: string;
  status: string;
  draft_document: boolean;
  source_filename: string | null;
  raw_text: string | null;
  warning: string | null;
};

type Line = {
  id: string;
  line_no: number;
  kind: string;
  description: string | null;
  reference: string | null;
  order_key: string | null;
  quantity: number | string | null;
  unit_amount: number | string | null;
  line_amount: number | string | null;
};

type LinkRow = {
  line_id: string;
  order_id: string | null;
  order_key: string | null;
  label: string | null;
  product_name: string | null;
  reference: string | null;
  flow: string | null;
  purchased: boolean | null;
  updated_at: string | null;
};
