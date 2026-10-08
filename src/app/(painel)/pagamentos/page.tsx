import Link from "next/link";
import { uploadInvoice } from "@/app/(painel)/pagamentos/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { TEMPLATE_LABEL, type InvoiceTemplate } from "@/lib/invoice-parse";

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
      i.status, i.template, i.draft_document,
      (count(distinct l.id))::int as line_count,
      (count(k.id))::int as link_count
    from ctl_supplier_invoices i
    left join ctl_supplier_invoice_lines l on l.invoice_id = i.id
    left join ctl_supplier_invoice_links k on k.line_id = l.id
    group by i.id
    order by i.created_at desc
  `;

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
                  <td>
                    {row.status === "confirmado" ? "Vinculada" : "Aguardando"}
                    <div className="text-xs text-muted">{labelOf(row.template)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelOf(template: string) {
  if (template in TEMPLATE_LABEL) return TEMPLATE_LABEL[template as InvoiceTemplate];
  return template;
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
  line_count: number;
  link_count: number;
};
