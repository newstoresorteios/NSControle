import Link from "next/link";
import { syncTrayNow } from "@/app/(painel)/tray-actions";
import { SyncButton, SyncStatus } from "@/components/sync-button";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvedFinanceOrder, financeSlices, monthSummary, type MoneyOrder } from "@/lib/finance";
import { asNumber, brl, monthLabel, percent } from "@/lib/format";
import { trayConfigured } from "@/lib/tray-client";

const QUEUES = [
  { id: "vindi", label: "A enviar Vindi", hint: "pagamento ainda não enviado" },
  { id: "devolucao", label: "Devolução", hint: "objeto voltando ou já devolvido" },
  { id: "alfandega", label: "Alfândega", hint: "parado em fiscalização" },
  { id: "sem_retorno", label: "Sem retorno", hint: "rastreio sem atualização" },
] as const;

const SYNC_MESSAGE: Record<string, string> = {
  ok: "Loja atualizada.",
  aguardando: "Uma atualização já está em andamento.",
  limite: "A Tray pediu uma pausa. A próxima rodada continua de onde parou.",
  erro: "Não foi possível falar com o TRAYadaptor.",
  nao_configurado: "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN.",
};

function saoPauloMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readStamp(value: string | null) {
  if (!value) return null;
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return null;
  if (dayKey(when) === dayKey(new Date())) {
    const clock = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(when);
    return `às ${clock}`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(when);
}

function lojaLine(sync: { last_run_at: string | null; last_report: { upserted?: number; cancellations?: number } | null } | null) {
  const stamp = readStamp(sync?.last_run_at ?? null);
  if (!stamp) return "Ainda não houve leitura da loja.";
  const saved = sync?.last_report?.upserted;
  const novos =
    saved == null ? "" : saved === 0 ? " Nenhum pedido novo." : saved === 1 ? " 1 pedido novo." : ` ${saved} pedidos novos.`;
  const cancellations = sync?.last_report?.cancellations ?? 0;
  const cancel =
    cancellations > 0 ? ` ${cancellations} ${cancellations === 1 ? "cancelamento" : "cancelamentos"}.` : "";
  return `Loja lida ${stamp}.${novos}${cancel}`;
}

function trayNotice(sync?: string, pedidos?: string): { message: string; tone: "ok" | "danger" | "muted" } | null {
  if (!sync || !SYNC_MESSAGE[sync]) return null;
  if (sync === "ok") {
    const count = Number(pedidos ?? 0);
    const saved =
      count > 0 ? `${count} ${count === 1 ? "pedido gravado" : "pedidos gravados"}.` : "Nenhum pedido novo nesta rodada.";
    return { message: `Loja atualizada. ${saved}`, tone: "ok" };
  }
  const tone = sync === "erro" || sync === "nao_configurado" || sync === "limite" ? "danger" : "muted";
  return { message: SYNC_MESSAGE[sync], tone };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; pedidos?: string; atraso?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const configured = trayConfigured();
  const month = saoPauloMonth();
  const sql = db();
  const [syncRows, countRows, goalRows, moneyRows, lateCountRows, lateRows] = await Promise.all([
    sql<{ last_run_at: string | null; last_report: { upserted?: number; cancellations?: number } | null }[]>`
      select last_run_at, last_report from ctl_tray_sync
      where id = 'orders'
      limit 1
    `,
    sql<{ vindi: number; devolucao: number; alfandega: number; sem_retorno: number }[]>`
      select
        count(*) filter (where commercial_status = 'A ENVIAR VINDI')::int as vindi,
        count(*) filter (where tracking_situation ilike '%DEVOLU%')::int as devolucao,
        count(*) filter (where tracking_situation ilike '%ALF%')::int as alfandega,
        count(*) filter (where tracking_situation ilike '%Sem retorno%')::int as sem_retorno
      from ctl_orders
    `,
    sql<{ month: string; target_amount: string }[]>`
      select month, target_amount from ctl_monthly_goals
      order by month desc
    `,
    sql<{
      finance_month: string;
      flow: string;
      order_key: string;
      label: string | null;
      origin: string | null;
      commercial_status: string | null;
      data_source: string | null;
      payment_date: string | null;
      sale_amount: string | null;
      purchase_amount: string | null;
      payment_fee: string | null;
      shipping_cost: string | null;
      import_tax: string | null;
    }[]>`
      select finance_month, flow, order_key, label, origin, commercial_status, data_source, payment_date,
        sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax
      from ctl_orders
      where finance_month is not null
        and coalesce(commercial_status, '') !~* 'aguard|cancel'
        and (
          data_source is distinct from 'tray'
          or sale_amount is not null
          or payment_date is not null
        )
    `,
    sql<{ total: number }[]>`
      select count(*)::int as total
      from ctl_orders
      where delivered = false
        and sale_amount is not null
        and nullif(btrim(coalesce(tracking_code, '')), '') is null
        and coalesce(commercial_status, '') !~* 'aguard|cancel'
        and coalesce(payment_date, purchase_date, created_at::date) <= (timezone('America/Sao_Paulo', now()))::date - 15
    `,
    params.atraso === "1"
      ? sql<{
          id: string;
          order_key: string;
          label: string | null;
          product_name: string | null;
          dia: string | null;
          commercial_status: string | null;
        }[]>`
          select id, order_key, label, product_name,
            coalesce(payment_date, purchase_date)::text as dia,
            commercial_status
          from ctl_orders
          where delivered = false
            and sale_amount is not null
            and nullif(btrim(coalesce(tracking_code, '')), '') is null
            and coalesce(commercial_status, '') !~* 'aguard|cancel'
            and coalesce(payment_date, purchase_date, created_at::date) <= (timezone('America/Sao_Paulo', now()))::date - 15
          order by coalesce(payment_date, purchase_date) asc nulls last
          limit 200
        `
      : Promise.resolve([]),
  ]);
  const tally = countRows[0];
  const counts = QUEUES.map((queue) => tally?.[queue.id] ?? 0);
  const sync = syncRows[0] ?? null;
  const trayResult = trayNotice(params.sync, params.pedidos);
  const approved = (moneyRows ?? []).filter((row) => approvedFinanceOrder(row));
  const byMonth = new Map<string, MoneyOrder[]>();
  for (const row of approved) {
    const key = String(row.finance_month).slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(row);
    else byMonth.set(key, [row]);
  }
  const months = [...byMonth.keys()].sort((left, right) => right.localeCompare(left));
  if (!months.includes(month)) months.unshift(month);
  const goalByMonth = new Map(goalRows.map((goal) => [String(goal.month).slice(0, 7), goal.target_amount]));
  const currentGoal = goalByMonth.get(month) ?? null;
  const summary = monthSummary(byMonth.get(month) ?? [], asNumber(currentGoal), month);
  const late = lateCountRows[0]?.total ?? 0;
  const showLate = params.atraso === "1";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Hoje</h1>
          <p className="mt-2 text-sm">{configured ? lojaLine(sync) : "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN."}</p>
        </div>
        {configured ? (
          <form action={syncTrayNow} className="grid justify-items-end gap-2">
            <SyncButton idle="Atualizar agora" pendingLabel="Atualizando…" />
            <SyncStatus pendingLabel="Lendo a loja…" message={trayResult?.message ?? null} tone={trayResult?.tone ?? "muted"} />
          </form>
        ) : null}
      </div>

      <section className="grid gap-3">
        <h2 className="section-title">O que fazer agora</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUEUES.map((queue, index) => (
            <Link key={queue.id} href={`/pedidos?fila=${queue.id}`} className="card stat block">
              <p className="kicker">{queue.label}</p>
              <p className="num mt-2 text-4xl font-medium tracking-tight">{counts[index]}</p>
              <p className="mt-1 text-sm text-muted">{queue.hint}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card stat">
          <p className="kicker">Alfândega</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(summary.alfandega)}</p>
          <p className="mt-1 text-sm text-muted">Valor lançado no mês. Pronta entrega fica de fora da pendência.</p>
        </article>
        <article className="card stat">
          <p className="kicker">Taxa de pagamento</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(summary.taxaMaquina)}</p>
          <p className="mt-1 text-sm text-muted">
            {summary.taxaMaquina > 0
              ? "Taxa gravada na ficha dos pedidos aprovados deste mês."
              : "Nenhum pedido aprovado deste mês tem taxa gravada. A loja ainda não devolveu a taxa do meio de pagamento."}
          </p>
        </article>
        <Link href={showLate ? "/" : "/?atraso=1#atraso"} className="card stat block">
          <p className="kicker">Sem rastreio há 15 dias</p>
          <p className={`num mt-2 text-3xl font-medium tracking-tight ${late ? "text-danger" : ""}`}>{late}</p>
          <p className="mt-1 text-sm text-muted">{late ? (showLate ? "Ocultar a lista" : "Ver os pedidos") : "Nada em aberto"}</p>
        </Link>
      </section>

      {showLate ? (
        <section id="atraso" className="card overflow-x-auto">
          <h2 className="section-title">Pedidos aprovados sem código de rastreio</h2>
          <p className="mt-1 text-sm text-muted">Pagos há mais de 15 dias e ainda sem rastreio.</p>
          <table className="mt-3">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Produto</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lateRows.length ? lateRows.map((order) => (
                <tr key={order.id}>
                  <td><Link className="underline" href={`/pedidos/${order.id}`}>{order.label || order.order_key}</Link></td>
                  <td>{order.product_name || "—"}</td>
                  <td>{order.dia ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${order.dia.slice(0, 10)}T00:00:00Z`)) : "—"}</td>
                  <td>{order.commercial_status || "—"}</td>
                </tr>
              )) : (
                <tr><td colSpan={4}>Nenhum pedido nessa condição.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {months.map((item) => {
        const rows = byMonth.get(item) ?? [];
        const goal = goalByMonth.get(item) ?? null;
        const itemSummary = item === month ? summary : monthSummary(rows, asNumber(goal), item);
        const slices = financeSlices(rows, item);
        const sales = rows.filter((row) => asNumber(row.sale_amount) != null).length;
        const withFee = rows.filter((row) => (asNumber(row.payment_fee) ?? 0) > 0).length;
        return (
          <section key={item} className="card overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="section-title">{monthLabel(item)}</h2>
                <p className="mt-1 text-sm text-muted">
                  {goal
                    ? `${percent(itemSummary.percentual)} da meta de ${brl(goal)}.`
                    : "Meta do mês ainda não definida."}
                  {itemSummary.vendasCreditos ? ` NS Créditos ${brl(itemSummary.vendasCreditos)} entram no resultado.` : ""}
                  {` Só pedidos aprovados. Taxa informada em ${withFee} de ${sales}.`}
                </p>
              </div>
              <Link className="button secondary" href={`/financeiro?month=${item}`}>
                Abrir financeiro
              </Link>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Venda</th>
                  <th>Custo</th>
                  <th>Lucro</th>
                  <th>Alfândega</th>
                  <th>Taxa de pagamento</th>
                  <th>Sem compra</th>
                  <th>Sem alfândega</th>
                  <th>Sem envio</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Soma</td>
                  <td className="num">{brl(itemSummary.vendas)}</td>
                  <td className="num">{brl(itemSummary.custoTotal)}</td>
                  <td className={`num ${itemSummary.resultado < 0 ? "text-danger" : "text-ok"}`}>{brl(itemSummary.resultado)}</td>
                  <td className="num">{brl(itemSummary.alfandega)}</td>
                  <td className="num">{brl(itemSummary.taxaMaquina)}</td>
                  <td className={`num ${itemSummary.semCompra ? "text-danger" : ""}`}>
                    <Link className="underline" href={`/financeiro?month=${item}&falta=compra`}>
                      {itemSummary.semCompra}
                    </Link>
                  </td>
                  <td className={`num ${itemSummary.semAlfandega ? "text-danger" : ""}`}>
                    <Link className="underline" href={`/financeiro?month=${item}&falta=alfandega`}>
                      {itemSummary.semAlfandega}
                    </Link>
                  </td>
                  <td className={`num ${itemSummary.semEnvio ? "text-danger" : ""}`}>
                    <Link className="underline" href={`/financeiro?month=${item}&falta=envio`}>
                      {itemSummary.semEnvio}
                    </Link>
                  </td>
                </tr>
                {slices.map((slice) => (
                  <tr key={slice.key}>
                    <td>{slice.label}</td>
                    <td className="num">{brl(slice.summary.vendas)}</td>
                    <td className="num">{brl(slice.summary.custoTotal)}</td>
                    <td className={`num ${slice.summary.resultado < 0 ? "text-danger" : "text-ok"}`}>
                      {brl(slice.summary.resultado)}
                    </td>
                    <td className="num">{brl(slice.summary.alfandega)}</td>
                    <td className="num">{brl(slice.summary.taxaMaquina)}</td>
                    <td className={`num ${slice.summary.semCompra ? "text-danger" : ""}`}>{slice.summary.semCompra}</td>
                    <td className={`num ${slice.summary.semAlfandega ? "text-danger" : ""}`}>{slice.summary.semAlfandega}</td>
                    <td className={`num ${slice.summary.semEnvio ? "text-danger" : ""}`}>{slice.summary.semEnvio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itemSummary.semCompra ? (
              <p className="mt-3 text-sm text-warn">Lucro parcial — {itemSummary.semCompra} pedidos sem compra. A margem do financeiro usa só os pedidos com compra lançada.</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
