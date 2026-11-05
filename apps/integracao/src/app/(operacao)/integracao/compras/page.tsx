import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { ANA_CURRENCIES, anaPurchaseVisible } from "@/lib/integracao";
import { attachAnaInvoice, updateAnaPurchase } from "./actions";

const FILTERS = [
  { id: "abertas", label: "A comprar" },
  { id: "compradas", label: "Compradas" },
  { id: "pagas", label: "Pagas" },
  { id: "todas", label: "Todas" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; situacao?: string }>;
}) {
  await requireOperator();
  const params = await searchParams;
  const situacao = filterOf(params.situacao);
  const sql = db();
  const found = await sql<PurchaseRow[]>`
    select o.id, o.order_key, o.origin, o.product_name, o.purchased, o.supplier_name, o.supplier_ref,
      o.supplier_purchase_date, o.purchase_amount, o.purchase_currency, o.purchase_foreign_amount,
      o.payment_date, r.requested_at
    from ctl_integration_purchase_requests r
    join ctl_orders o on o.id = r.order_id
    order by r.requested_at desc
    limit 200
  `;
  const rows = found.filter((row) => anaPurchaseVisible({ origin: row.origin, requested: true }));
  const ids = rows.map((row) => row.id);
  const invoices = ids.length
    ? await sql<InvoiceRow[]>`
        select k.order_id, i.id as invoice_id, i.invoice_number, i.invoice_date, i.currency, i.status,
          i.supplier_name, l.line_amount, (i.document is not null) as has_document
        from ctl_supplier_invoice_links k
        join ctl_supplier_invoice_lines l on l.id = k.line_id
        join ctl_supplier_invoices i on i.id = l.invoice_id
        where k.order_id in ${sql(ids)}
        order by i.invoice_date desc nulls last, l.line_no
      `
    : [];
  const byOrder = new Map<string, InvoiceRow[]>();
  for (const invoice of invoices) {
    const list = byOrder.get(invoice.order_id) ?? [];
    list.push(invoice);
    byOrder.set(invoice.order_id, list);
  }
  const visible = rows.filter((row) => matches(row, situacao));

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p>
        <h1 className="page-title mt-2">Compras</h1>
        <p className="text-muted">
          Pedidos de origem Europa que a New Store pediu para comprar. O status, o fornecedor, o valor e o pagamento
          ficam na ficha do pedido. As faturas entram em Pagamentos.
        </p>
      </header>
      {params.erro ? <p role="alert" className="card text-danger">{params.erro}</p> : null}
      {params.ok ? <p role="status" className="text-ok">Compra atualizada.</p> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card stat">
          <p className="kicker">A comprar</p>
          <p className="num mt-2 text-3xl">{rows.filter((row) => !row.purchased).length}</p>
        </article>
        <article className="card stat">
          <p className="kicker">Compradas sem pagamento</p>
          <p className="num mt-2 text-3xl">{rows.filter((row) => row.purchased && !row.payment_date).length}</p>
          <p className="mt-1 text-sm text-muted">{moneyList(openTotals(rows))}</p>
        </article>
        <article className="card stat">
          <p className="kicker">Pagas</p>
          <p className="num mt-2 text-3xl">{rows.filter((row) => row.payment_date).length}</p>
          <p className="mt-1 text-sm text-muted">{moneyList(paidTotals(rows))}</p>
        </article>
      </section>
      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <a key={item.id} className={item.id === situacao ? "button" : "button secondary"} href={`/integracao/compras?situacao=${item.id}`}>
            {item.label}
          </a>
        ))}
      </nav>
      {!visible.length ? <p className="card text-muted">Nenhum pedido nesta lista.</p> : null}
      {visible.map((row) => (
        <article key={row.id} className="card grid gap-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title">Pedido {row.order_key}</h2>
              <p>{row.product_name || "Produto ainda não informado"}</p>
              <p className="text-xs text-muted">Solicitado em {when(row.requested_at)}</p>
            </div>
            <p className="text-sm font-medium">{row.purchased ? "Comprado" : "Solicitado"}</p>
          </header>
          <form action={updateAnaPurchase} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="id" value={row.id} />
            <label>
              Status
              <select name="purchased" defaultValue={row.purchased ? "true" : "false"}>
                <option value="false">Solicitado</option>
                <option value="true">Comprado</option>
              </select>
            </label>
            <label>
              Fornecedor
              <input name="supplier_name" defaultValue={row.supplier_name ?? ""} maxLength={200} />
            </label>
            <label>
              Referência
              <input name="supplier_ref" defaultValue={row.supplier_ref ?? ""} maxLength={200} />
            </label>
            <label>
              Compra ao fornecedor
              <input name="supplier_purchase_date" type="date" defaultValue={day(row.supplier_purchase_date)} />
            </label>
            <label>
              Valor na moeda
              <input name="purchase_foreign_amount" inputMode="decimal" defaultValue={amountInput(row.purchase_foreign_amount)} />
            </label>
            <label>
              Moeda
              <select name="purchase_currency" defaultValue={row.purchase_currency ?? ""}>
                <option value="">—</option>
                {ANA_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <label>
              Pagamento
              <input name="payment_date" type="date" defaultValue={day(row.payment_date)} />
            </label>
            <p className="text-sm text-muted md:col-span-2">
              Custo em reais: {row.purchase_amount == null ? "entra quando a fatura é confirmada em Pagamentos" : money(row.purchase_amount, "BRL")}
            </p>
            <button className="w-fit" type="submit">Salvar compra</button>
          </form>
          <div className="grid gap-2 text-sm">
            <h3 className="section-title">Faturas</h3>
            {(byOrder.get(row.id) ?? []).length ? (
              <ul className="grid gap-1">
                {(byOrder.get(row.id) ?? []).map((invoice) => (
                  <li key={`${invoice.invoice_id}-${invoice.line_amount}`}>
                    {invoice.has_document ? (
                      <a className="underline" href={`/integracao/compras/fatura/${invoice.invoice_id}`}>{invoice.invoice_number || "Fatura"}</a>
                    ) : (
                      invoice.invoice_number || "Fatura"
                    )}
                    {invoice.supplier_name ? ` · ${invoice.supplier_name}` : ""}
                    {" · "}
                    <span className="num">{money(invoice.line_amount, invoice.currency)}</span>
                    {invoice.invoice_date ? ` · ${dayLabel(invoice.invoice_date)}` : ""}
                    {invoice.status === "confirmado" ? " · confirmada" : " · aguardando confirmação"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Nenhuma fatura anexada.</p>
            )}
            <form action={attachAnaInvoice} className="grid gap-3 md:grid-cols-4">
              <input type="hidden" name="id" value={row.id} />
              <label>
                Número
                <input name="invoice_number" maxLength={80} />
              </label>
              <label>
                Data
                <input name="invoice_date" type="date" />
              </label>
              <label>
                Valor da linha
                <input name="amount" inputMode="decimal" placeholder={amountInput(row.purchase_foreign_amount)} />
              </label>
              <label>
                Moeda
                <select name="currency" defaultValue={row.purchase_currency || "EUR"}>
                  {ANA_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                Fornecedor da fatura
                <input name="supplier_name" defaultValue={row.supplier_name ?? ""} maxLength={200} />
              </label>
              <label className="md:col-span-2">
                PDF
                <input name="arquivo" type="file" accept="application/pdf,.pdf" required />
              </label>
              <button className="secondary w-fit" type="submit">Anexar fatura</button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}

function filterOf(value: string | undefined): FilterId {
  return FILTERS.some((item) => item.id === value) ? value as FilterId : "abertas";
}

function matches(row: PurchaseRow, situacao: FilterId) {
  if (situacao === "abertas") return !row.purchased;
  if (situacao === "compradas") return row.purchased && !row.payment_date;
  if (situacao === "pagas") return Boolean(row.payment_date);
  return true;
}

function openTotals(rows: PurchaseRow[]) {
  return totals(rows.filter((row) => !row.payment_date));
}

function paidTotals(rows: PurchaseRow[]) {
  return totals(rows.filter((row) => row.payment_date));
}

function totals(rows: PurchaseRow[]) {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.purchase_foreign_amount);
    if (!Number.isFinite(amount)) continue;
    const currency = row.purchase_currency || "EUR";
    sums.set(currency, (sums.get(currency) ?? 0) + amount);
  }
  return [...sums.entries()];
}

function moneyList(entries: Array<[string, number]>) {
  if (!entries.length) return "Sem valor lançado";
  return entries.map(([currency, amount]) => money(amount, currency)).join(" · ");
}

function money(value: number | string | null, currency: string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "EUR" }).format(amount);
  } catch {
    return `${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
  }
}

function day(value: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function dayLabel(value: string) {
  const [year, month, date] = String(value).slice(0, 10).split("-");
  return year && month && date ? `${date}/${month}/${year}` : "—";
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function amountInput(value: number | string | null) {
  if (value == null || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

type PurchaseRow = {
  id: string;
  order_key: string;
  origin: string | null;
  product_name: string | null;
  purchased: boolean;
  supplier_name: string | null;
  supplier_ref: string | null;
  supplier_purchase_date: string | null;
  purchase_amount: number | string | null;
  purchase_currency: string | null;
  purchase_foreign_amount: number | string | null;
  payment_date: string | null;
  requested_at: string;
};

type InvoiceRow = {
  order_id: string;
  invoice_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  status: string;
  supplier_name: string | null;
  line_amount: number | string | null;
  has_document: boolean;
};
