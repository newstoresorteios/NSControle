import Link from "next/link";
import { uploadInvoice } from "@/app/(painel)/pagamentos/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, money, shortDate } from "@/lib/format";
import { roundMoney } from "@/lib/invoice-cost";
import { rememberInvoiceRate } from "@/lib/invoice-rate";

const ERRORS: Record<string, string> = {
  arquivo: "Envie um PDF de até 8 MB.",
  texto: "Este PDF não tem texto selecionável.",
  ler: "Não foi possível ler o PDF.",
  salvar: "Não foi possível gravar a fatura.",
};

export default async function PagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const sql = db();
  const rows = await sql<InvoiceRow[]>`
    select
      i.id, i.supplier_name, i.invoice_number, i.invoice_date, i.currency, i.total_amount,
      i.status, i.template, i.draft_document, i.fx_rate, i.fx_date,
      (count(distinct l.id))::int as line_count,
      (count(k.id))::int as link_count,
      coalesce((
        select sum(p.quantity) from ctl_supplier_invoice_lines p
        where p.invoice_id = i.id and p.kind = 'produto'
      ), 0) as item_qty
    from ctl_supplier_invoices i
    left join ctl_supplier_invoice_lines l on l.invoice_id = i.id
    left join ctl_supplier_invoice_links k on k.line_id = l.id
    group by i.id
    order by i.created_at desc
  `;
  const quotes = await Promise.all(
    rows.map((row) => rememberInvoiceRate(row.id, row.currency, row.invoice_date, row.fx_rate, row.fx_date)),
  );

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Pagamentos</h1>
        <p className="text-muted">
          Faturas de fornecedor. Edjouse, Pesci e CA são lidos no código e sugerem o pedido pelo número ou pela
          referência. O vínculo só fica gravado depois da confirmação.
        </p>
      </div>
      {params.erro && ERRORS[params.erro] ? <p className="text-sm text-danger">{ERRORS[params.erro]}</p> : null}
      {rows.length ? <PaymentSummary rows={rows} quotes={quotes} /> : null}
      <form action={uploadInvoice} className="card grid gap-3 md:max-w-xl">
        <h2 className="section-title">Enviar fatura</h2>
        <label className="grid gap-1 text-sm">
          PDF
          <input name="arquivo" type="file" accept="application/pdf,.pdf" required />
        </label>
        <button type="submit" className="md:w-fit">
          Ler PDF
        </button>
      </form>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Fatura</th>
              <th>Fornecedor</th>
              <th>Data</th>
              <th>Total</th>
              <th>Linhas</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>Nenhuma fatura enviada.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="underline" href={`/pagamentos/${row.id}`}>
                      {row.invoice_number || "Sem número"}
                    </Link>
                    {row.draft_document ? <div className="text-xs text-muted">PDF em rascunho</div> : null}
                  </td>
                  <td>{row.supplier_name || "—"}</td>
                  <td>{shortDate(row.invoice_date)}</td>
                  <td className="num">{money(row.total_amount, row.currency)}</td>
                  <td>
                    {row.line_count} {row.line_count === 1 ? "linha" : "linhas"}
                    <div className="text-xs text-muted">
                      {row.link_count} {row.link_count === 1 ? "vínculo" : "vínculos"}
                    </div>
                  </td>
                  <td>{row.status === "confirmado" ? "Confirmada" : "Aguardando confirmação"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentSummary({ rows, quotes }: { rows: InvoiceRow[]; quotes: Array<{ rate: number } | null> }) {
  let brl = 0;
  let priced = 0;
  const items = rows.reduce((sum, row) => sum + (asNumber(row.item_qty) ?? 0), 0);
  rows.forEach((row, index) => {
    const total = asNumber(row.total_amount);
    const rate = quotes[index]?.rate;
    if (total == null || rate == null) return;
    brl += total * rate;
    priced += 1;
  });
  const totalBrl = roundMoney(brl);
  const average = items > 0 && priced ? roundMoney(totalBrl / items) : null;
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <article className="card stat">
        <p className="kicker">Total dos pagamentos</p>
        <p className="num mt-2 text-3xl font-medium tracking-tight">{priced ? money(totalBrl, "BRL") : "—"}</p>
        <p className="mt-1 text-sm text-muted">Convertido pela PTAX do dia de cada fatura.</p>
      </article>
      <article className="card stat">
        <p className="kicker">Itens</p>
        <p className="num mt-2 text-3xl font-medium tracking-tight">{items}</p>
        <p className="mt-1 text-sm text-muted">Relógios e peças, sem a taxa.</p>
      </article>
      <article className="card stat">
        <p className="kicker">Custo médio</p>
        <p className="num mt-2 text-3xl font-medium tracking-tight">{average == null ? "—" : money(average, "BRL")}</p>
        <p className="mt-1 text-sm text-muted">Total em reais dividido pelos itens.</p>
      </article>
    </section>
  );
}

type InvoiceRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  total_amount: number | string | null;
  status: string;
  template: string;
  draft_document: boolean;
  fx_rate: number | string | null;
  fx_date: string | null;
  line_count: number;
  link_count: number;
  item_qty: number | string;
};
