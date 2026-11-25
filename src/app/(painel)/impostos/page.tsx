import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl, shortDate } from "@/lib/format";
import { customsFilterStatuses, customsStatusLabel } from "@/lib/taxes";

const PAGE_SIZE = 50;

const FILTERS = [
  { key: "", label: "Todas" },
  { key: "abertas", label: "A pagar" },
  { key: "boleto", label: "Boleto gerado" },
  { key: "pagas", label: "Pagas" },
  { key: "falhas", label: "Sem cobrança" },
] as const;

type TaxRow = {
  id: string;
  tracking_code: string;
  tax_amount: string | null;
  payment_status: string;
  due_date: string | null;
  linha_digitavel: string | null;
  pdf_path: string | null;
  last_scraped_at: string | null;
  order_id: string | null;
  order_key: string | null;
  label: string | null;
  product_name: string | null;
};

type Summary = {
  total: number;
  abertas: number;
  valor_aberto: string;
  pagas: number;
  valor_pago: string;
  sem_valor: number;
};

function missingTable(error: unknown) {
  return (error as { code?: string }).code === "42P01";
}

function pageHref(situacao: string, q: string, page: number) {
  const params = new URLSearchParams();
  if (situacao) params.set("situacao", situacao);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/impostos?${query}` : "/impostos";
}

export default async function ImpostosPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const situacao = FILTERS.some((filter) => filter.key === params.situacao) ? params.situacao || "" : "";
  const q = (params.q || "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const statuses = customsFilterStatuses(situacao);
  const needle = `%${q.replace(/[%_\\]/g, "")}%`;
  const sql = db();

  let summary: Summary | null = null;
  let rows: TaxRow[] = [];
  let total = 0;
  let unavailable = false;
  try {
    const [totals] = await sql<Summary[]>`
      select
        count(*)::int as total,
        count(*) filter (where payment_status in ('pending', 'awaiting_payment', 'boleto_pending', 'overdue'))::int as abertas,
        coalesce(sum(tax_amount) filter (where payment_status in ('pending', 'awaiting_payment', 'boleto_pending', 'overdue')), 0)::text as valor_aberto,
        count(*) filter (where payment_status = 'paid')::int as pagas,
        coalesce(sum(tax_amount) filter (where payment_status = 'paid'), 0)::text as valor_pago,
        count(*) filter (where tax_amount is null)::int as sem_valor
      from ctl_correios_taxas
    `;
    summary = totals;
    const [counted] = await sql<{ total: number }[]>`
      select count(*)::int as total
      from ctl_correios_taxas t
      left join ctl_orders o on o.id = t.order_id
      where (${statuses == null} or t.payment_status = any(${statuses ?? []}))
        and (
          ${q} = ''
          or t.tracking_code ilike ${needle}
          or coalesce(o.order_key, '') ilike ${needle}
          or coalesce(o.label, '') ilike ${needle}
          or coalesce(o.product_name, '') ilike ${needle}
        )
    `;
    total = counted?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const current = Math.min(page, pages);
    rows = await sql<TaxRow[]>`
      select t.id, t.tracking_code, t.tax_amount::text, t.payment_status, t.due_date::text,
        coalesce(nullif(btrim(t.linha_digitavel), ''), b.linha_digitavel) as linha_digitavel,
        coalesce(t.pdf_path, b.pdf_path) as pdf_path,
        t.last_scraped_at::text, t.order_id, o.order_key, o.label, o.product_name
      from ctl_correios_taxas t
      left join ctl_orders o on o.id = t.order_id
      left join lateral (
        select linha_digitavel, pdf_path
        from ctl_correios_boletos
        where tax_id = t.id
        order by downloaded_at desc
        limit 1
      ) b on true
      where (${statuses == null} or t.payment_status = any(${statuses ?? []}))
        and (
          ${q} = ''
          or t.tracking_code ilike ${needle}
          or coalesce(o.order_key, '') ilike ${needle}
          or coalesce(o.label, '') ilike ${needle}
          or coalesce(o.product_name, '') ilike ${needle}
        )
      order by t.last_scraped_at desc, t.tracking_code
      limit ${PAGE_SIZE}
      offset ${(current - 1) * PAGE_SIZE}
    `;
  } catch (error) {
    if (!missingTable(error)) throw error;
    unavailable = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Impostos / Alfândega</h1>
        <p className="max-w-3xl text-sm text-muted">
          Taxas alfandegárias coletadas pelo robô no Portal Importador dos Correios. Cada linha é um rastreio.
          Boleto gerado ainda não é taxa paga.
        </p>
      </div>
      {unavailable ? (
        <p className="text-sm text-muted">As tabelas do robô ainda não estão neste banco.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="card">
              <p className="kicker">A pagar</p>
              <p className="num mt-2 text-2xl font-medium">{brl(summary?.valor_aberto)}</p>
              <p className="mt-1 text-sm text-muted">{summary?.abertas ?? 0} rastreios em aberto</p>
            </article>
            <article className="card">
              <p className="kicker">Pagas</p>
              <p className="num mt-2 text-2xl font-medium">{brl(summary?.valor_pago)}</p>
              <p className="mt-1 text-sm text-muted">{summary?.pagas ?? 0} rastreios</p>
            </article>
            <article className="card">
              <p className="kicker">Sem valor</p>
              <p className="num mt-2 text-2xl font-medium">{summary?.sem_valor ?? 0}</p>
              <p className="mt-1 text-sm text-muted">{summary?.total ?? 0} taxas no total</p>
            </article>
          </div>
          <nav className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <Link
                key={filter.key || "todas"}
                className={situacao === filter.key ? "button" : "button secondary"}
                href={pageHref(filter.key, q, 1)}
              >
                {filter.label}
              </Link>
            ))}
          </nav>
          <form className="card flex flex-wrap items-end gap-3" action="/impostos">
            {situacao ? <input type="hidden" name="situacao" value={situacao} /> : null}
            <label className="grid min-w-60 gap-1 text-sm">
              Pedido, produto ou rastreio
              <input name="q" defaultValue={q} />
            </label>
            <button className="ok" type="submit">Buscar</button>
          </form>
          <div className="card overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Rastreio</th>
                  <th>Situação</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Linha digitável</th>
                  <th>Visto em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.order_id ? (
                        <Link className="underline" href={`/pedidos/${row.order_id}`}>{row.label || row.order_key}</Link>
                      ) : (
                        "Sem pedido"
                      )}
                      {row.product_name ? <p className="text-xs text-muted">{row.product_name}</p> : null}
                    </td>
                    <td className="font-mono text-xs">{row.tracking_code}</td>
                    <td>
                      {customsStatusLabel(row.payment_status)}
                      {row.pdf_path ? <p className="text-xs text-muted">PDF salvo</p> : null}
                    </td>
                    <td>{asNumber(row.tax_amount) == null ? "—" : brl(row.tax_amount)}</td>
                    <td>{shortDate(row.due_date)}</td>
                    <td className="max-w-64 font-mono text-xs">{row.linha_digitavel || "—"}</td>
                    <td>{shortDate(row.last_scraped_at)}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Nenhuma taxa nesta situação.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="flex gap-3 text-sm">
              {current > 1 ? <Link className="button secondary" href={pageHref(situacao, q, current - 1)}>Anterior</Link> : null}
              <span className="self-center text-muted">
                {rows.length} nesta página · {total} taxas
              </span>
              {current < pages ? <Link className="button secondary" href={pageHref(situacao, q, current + 1)}>Próxima</Link> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
