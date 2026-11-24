import Link from "next/link";
import { syncTrayNow } from "@/app/(painel)/tray-actions";
import { MonthSelect } from "@/components/month-select";
import { SyncButton, SyncStatus } from "@/components/sync-button";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvedFinanceOrder, FINANCE_STATUS_OUT, financeSlices, monthSummary, type MoneyOrder } from "@/lib/finance";
import { asNumber, brl, monthLabel, percent } from "@/lib/format";
import { trayConfigured } from "@/lib/tray-client";

const PENDENCIAS = [
  { id: "vindi", label: "A enviar Vindi", hint: "Pagamento ao fornecedor ainda não enviado." },
  { id: "a_enviar", label: "A enviar", hint: "Pedido pronto para envio, fora da fila da Vindi." },
  { id: "devolucao", label: "Devolução", hint: "Último evento dos Correios é devolução ao remetente." },
  { id: "alfandega", label: "Alfândega", hint: "Último evento dos Correios foi lido como fiscalização ou recebimento no Brasil." },
  { id: "sem_retorno", label: "Sem retorno", hint: "A consulta do rastreio falhou ou o objeto ficou sem movimento." },
  { id: "sem_rastreio", label: "Sem rastreio", hint: "Venda lançada e ainda sem código de rastreio." },
  { id: "sem_rastreio_15", label: "Sem rastreio há 15 dias", hint: "Pagos há mais de 15 dias e ainda sem código." },
  { id: "imposto", label: "Imposto em aberto", hint: "Taxa de importação lançada e ainda não confirmada como paga." },
] as const;

const SYNC_MESSAGE: Record<string, string> = {
  ok: "Loja atualizada.",
  aguardando: "Uma atualização já está em andamento.",
  limite: "A Tray pediu uma pausa. A próxima rodada continua de onde parou.",
  erro: "Não foi possível falar com o TRAYadaptor.",
  nao_configurado: "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN.",
};

function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function queueHref(id: string, month: string) {
  if (id === "sem_rastreio_15") return `/?month=${month}&atraso=1#atraso`;
  if (id === "imposto") return `/financeiro?month=${month}&aba=taxas`;
  return `/pedidos?fila=${id}&mes=${month}`;
}

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
  searchParams: Promise<{ sync?: string; pedidos?: string; atraso?: string; month?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const configured = trayConfigured();
  const month = saoPauloMonth();
  const sql = db();
  const [syncRows, countRows, goalRows, moneyRows] = await Promise.all([
    sql<{ last_run_at: string | null; last_report: { upserted?: number; cancellations?: number } | null }[]>`
      select last_run_at, last_report from ctl_tray_sync
      where id = 'orders'
      limit 1
    `,
    sql<{ month: string; vindi: number; a_enviar: number; devolucao: number; alfandega: number; sem_retorno: number; sem_rastreio: number; sem_rastreio_15: number; imposto: number }[]>`
      select
        to_char(finance_month, 'YYYY-MM') as month,
        count(*) filter (where commercial_status = 'A ENVIAR VINDI')::int as vindi,
        count(*) filter (where delivered = false and commercial_status = 'A ENVIAR')::int as a_enviar,
        count(*) filter (where tracking_situation ilike '%DEVOLU%')::int as devolucao,
        count(*) filter (where tracking_situation ilike '%ALF%')::int as alfandega,
        count(*) filter (where tracking_situation ilike '%Sem retorno%')::int as sem_retorno,
        count(*) filter (where delivered = false
          and nullif(btrim(coalesce(tracking_code, '')), '') is null
          and coalesce(commercial_status, '') !~* ${FINANCE_STATUS_OUT}
          and (sale_amount is not null or payment_date is not null))::int as sem_rastreio,
        count(*) filter (where delivered = false
          and sale_amount is not null
          and nullif(btrim(coalesce(tracking_code, '')), '') is null
          and coalesce(commercial_status, '') !~* ${FINANCE_STATUS_OUT}
          and coalesce(payment_date, purchase_date, created_at::date) <= (timezone('America/Sao_Paulo', now()))::date - 15)::int as sem_rastreio_15,
        count(*) filter (where tax_paid = false and import_tax is not null and coalesce(commercial_status, '') !~* 'cancel')::int as imposto
      from ctl_orders
      where finance_month is not null
      group by 1
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
        and coalesce(commercial_status, '') !~* ${FINANCE_STATUS_OUT}
        and (
          data_source is distinct from 'tray'
          or sale_amount is not null
          or payment_date is not null
        )
    `,
  ]);
  const tallyByMonth = new Map(countRows.map((row) => [row.month, row]));
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
  const selected = (params.month && months.includes(params.month) ? params.month : months[0]) ?? month;
  const goalByMonth = new Map(goalRows.map((goal) => [String(goal.month).slice(0, 7), goal.target_amount]));
  const currentGoal = goalByMonth.get(selected) ?? null;
  const summary = monthSummary(byMonth.get(selected) ?? [], asNumber(currentGoal), selected);
  const tally = tallyByMonth.get(selected);
  const windowMonths = [-2, -1, 0].map((delta) => shiftMonth(selected, delta));
  const windowSummaries = new Map(
    windowMonths.map((item) => [item, monthSummary(byMonth.get(item) ?? [], asNumber(goalByMonth.get(item)), item)]),
  );
  const [lateRows] = await Promise.all([
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
            and coalesce(commercial_status, '') !~* ${FINANCE_STATUS_OUT}
            and coalesce(payment_date, purchase_date, created_at::date) <= (timezone('America/Sao_Paulo', now()))::date - 15
            and finance_month = ${`${selected}-01`}::date
          order by coalesce(payment_date, purchase_date) asc nulls last
          limit 200
        `
      : Promise.resolve([]),
  ]);
  const showLate = params.atraso === "1";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Hoje</h1>
          <p className="mt-2 text-sm">{configured ? lojaLine(sync) : "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN."}</p>
          <form action="/" className="mt-3 w-64 max-w-full">
            {showLate ? <input type="hidden" name="atraso" value="1" /> : null}
            <label className="grid gap-1 text-sm">
              Mês
              <MonthSelect key={selected} months={months} value={selected} />
            </label>
          </form>
        </div>
        {configured ? (
          <form action={syncTrayNow} className="grid justify-items-end gap-2">
            <SyncButton idle="Atualizar agora" pendingLabel="Atualizando…" />
            <SyncStatus pendingLabel="Lendo a loja…" message={trayResult?.message ?? null} tone={trayResult?.tone ?? "muted"} />
          </form>
        ) : null}
      </div>

      <section className="band band-month grid gap-3">
        <div>
          <h2 className="section-title">{monthLabel(selected)}</h2>
          <p className="mt-1 text-sm text-muted">Pendências e valores só deste mês.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="card stat stat-info">
            <p className="kicker">Alfândega</p>
            <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(summary.alfandega)}</p>
            <p className="mt-1 text-sm text-muted">Valor lançado no mês. Pronta entrega fica de fora da pendência.</p>
          </article>
          <article className="card stat">
            <p className="kicker">Taxa de pagamento</p>
            <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(summary.taxaMaquina)}</p>
            <p className="mt-1 text-sm text-muted">
              {summary.taxaMaquina > 0
                ? "Taxa gravada na ficha dos pedidos deste mês."
                : "Nenhum pedido deste mês tem taxa gravada. A loja ainda não devolveu a taxa do meio de pagamento."}
            </p>
          </article>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PENDENCIAS.map((item) => {
            const inMonth = tally?.[item.id] ?? 0;
            const href = item.id === "sem_rastreio_15" && showLate ? `/?month=${selected}` : queueHref(item.id, selected);
            return (
              <Link key={item.id} href={href} className="card stat block">
                <p className="kicker">{item.label}</p>
                <p className={`num mt-2 text-4xl font-medium tracking-tight ${inMonth ? "text-danger" : ""}`}>{inMonth}</p>
                <p className="mt-1 text-sm text-muted">{item.id === "sem_rastreio_15" && showLate ? "Ocultar a lista" : item.hint}</p>
              </Link>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={`/financeiro?month=${selected}&aba=pendencias&falta=compra`} className="card stat block">
            <p className="kicker">Sem preço de compra</p>
            <p className={`num mt-2 text-4xl font-medium tracking-tight ${summary.semCompra ? "text-danger" : ""}`}>{summary.semCompra}</p>
            <p className="mt-1 text-sm text-muted">Venda lançada e custo de compra ainda em branco.</p>
          </Link>
          <Link href={`/financeiro?month=${selected}&aba=pendencias&falta=alfandega`} className="card stat block">
            <p className="kicker">Sem taxa alfandegária</p>
            <p className={`num mt-2 text-4xl font-medium tracking-tight ${summary.semAlfandega ? "text-danger" : ""}`}>{summary.semAlfandega}</p>
            <p className="mt-1 text-sm text-muted">Importação que ainda exige o imposto. Pronta entrega fica de fora.</p>
          </Link>
          <Link href={`/financeiro?month=${selected}&aba=pendencias&falta=envio`} className="card stat block">
            <p className="kicker">Sem custo de envio</p>
            <p className={`num mt-2 text-4xl font-medium tracking-tight ${summary.semEnvio ? "text-danger" : ""}`}>{summary.semEnvio}</p>
            <p className="mt-1 text-sm text-muted">Venda lançada e frete ainda em branco.</p>
          </Link>
          <Link href={`/financeiro?month=${selected}`} className="card stat block">
            <p className="kicker">Sem taxa de pagamento</p>
            <p className={`num mt-2 text-4xl font-medium tracking-tight ${summary.semTaxa ? "text-danger" : ""}`}>{summary.semTaxa}</p>
            <p className="mt-1 text-sm text-muted">Pedido com venda e tarifa do gateway ainda vazia.</p>
          </Link>
        </div>
      </section>

      <section className="band band-quarter grid gap-4">
        <div>
          <h2 className="section-title">Últimos 3 meses</h2>
          <p className="mt-1 text-sm text-muted">Cada mês no seu retângulo. A faixa azul marca {monthLabel(selected)}.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {windowMonths.map((month) => {
            const itemSummary = windowSummaries.get(month);
            if (!itemSummary) return null;
            const monthTally = tallyByMonth.get(month);
            const current = month === selected;
            const figures = [
              ["Loja nova", brl(itemSummary.vendasLoja)],
              ["Loja antiga", brl(itemSummary.vendasEncomenda)],
              ["Total", brl(itemSummary.vendasLojas)],
              ["Compra", brl(itemSummary.custoCompra)],
              ["Frete", brl(itemSummary.frete)],
              ["Alfândega", brl(itemSummary.alfandega)],
              ["Taxa de pagamento", brl(itemSummary.taxaMaquina)],
              ["Custo", brl(itemSummary.custoTotal)],
              ["Lucro", brl(itemSummary.resultado)],
            ] as const;
            const gaps = [
              ["Sem preço de compra", itemSummary.semCompra, `/financeiro?month=${month}&aba=pendencias&falta=compra`],
              ["Sem taxa alfandegária", itemSummary.semAlfandega, `/financeiro?month=${month}&aba=pendencias&falta=alfandega`],
              ["Sem custo de envio", itemSummary.semEnvio, `/financeiro?month=${month}&aba=pendencias&falta=envio`],
              ["Sem taxa de pagamento", itemSummary.semTaxa, `/financeiro?month=${month}`],
            ] as const;
            return (
              <article key={month} className={`month-frame grid gap-3 ${current ? "month-frame-current" : ""}`}>
                <h3 className="section-title">{monthLabel(month)}</h3>
                <dl className="grid gap-1 text-sm">
                  {figures.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line py-1">
                      <dt className="text-muted">{label}</dt>
                      <dd className={`num ${label === "Lucro" && itemSummary.resultado < 0 ? "text-danger" : ""}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  {PENDENCIAS.map((item) => {
                    const count = monthTally?.[item.id] ?? 0;
                    const href = item.id === "sem_rastreio_15" && showLate && current ? `/?month=${month}` : queueHref(item.id, month);
                    return (
                      <Link key={item.id} href={href} className="card card-tight stat block">
                        <p className="kicker">{item.label}</p>
                        <p className={`num mt-1 text-2xl font-medium ${count ? "text-danger" : ""}`}>{count}</p>
                      </Link>
                    );
                  })}
                  {gaps.map(([label, count, href]) => (
                    <Link key={label} href={href} className="card card-tight stat block">
                      <p className="kicker">{label}</p>
                      <p className={`num mt-1 text-2xl font-medium ${count ? "text-danger" : ""}`}>{count}</p>
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showLate ? (
        <section id="atraso" className="card overflow-x-auto">
          <h2 className="section-title">Sem rastreio há 15 dias</h2>
          <p className="mt-1 text-sm text-muted">Pedidos de {monthLabel(selected)} pagos há mais de 15 dias e ainda sem código. A lista mostra os 200 mais antigos desse mês.</p>
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

      {[selected].map((item) => {
        const rows = byMonth.get(item) ?? [];
        const goal = goalByMonth.get(item) ?? null;
        const itemSummary = summary;
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
                  {` Entram os pedidos com venda lançada, inclusive Aguardando Vindi. Fora da conta: cancelado e aguardando pagamento. Taxa informada em ${withFee} de ${sales}.`}
                  {" Loja nova é a pronta entrega (NS Relógios). Loja antiga é a venda do mês inteiro e já inclui a loja nova. O total soma os dois, como o cabeçalho da planilha. O lucro desconta o custo uma vez."}
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
                  <td>Total (nova + antiga)</td>
                  <td className="num">{brl(itemSummary.vendasLojas)}</td>
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
