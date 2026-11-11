import Link from "next/link";
import { syncTrayNow } from "@/app/(painel)/tray-actions";
import { SyncButton, SyncStatus } from "@/components/sync-button";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { financeSlices, monthSummary } from "@/lib/finance";
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
  searchParams: Promise<{ sync?: string; pedidos?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const configured = trayConfigured();
  const month = saoPauloMonth();
  const monthDate = `${month}-01`;
  const sql = db();
  const [syncRows, countRows, goalRows, moneyRows] = await Promise.all([
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
    sql<{ target_amount: string }[]>`
      select target_amount from ctl_monthly_goals
      where month = ${monthDate}
      limit 1
    `,
    sql<{
      flow: string;
      order_key: string;
      sale_amount: string | null;
      purchase_amount: string | null;
      payment_fee: string | null;
      shipping_cost: string | null;
      import_tax: string | null;
    }[]>`
      select flow, order_key, sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax
      from ctl_orders
      where finance_month = ${monthDate}
    `,
  ]);
  const tally = countRows[0];
  const counts = QUEUES.map((queue) => tally?.[queue.id] ?? 0);
  const sync = syncRows[0] ?? null;
  const trayResult = trayNotice(params.sync, params.pedidos);
  const summary = monthSummary(moneyRows ?? [], asNumber(goalRows[0]?.target_amount), month);
  const slices = financeSlices(moneyRows ?? [], month);

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

      <section className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title">{monthLabel(month)}</h2>
            <p className="mt-1 text-sm text-muted">
              {goalRows[0]
                ? `${percent(summary.percentual)} da meta de ${brl(goalRows[0].target_amount)}.`
                : "Meta do mês ainda não definida."}
              {summary.vendasCreditos ? ` NS Créditos ${brl(summary.vendasCreditos)} entram no resultado.` : ""}
            </p>
          </div>
          <Link className="button secondary" href={`/financeiro?month=${month}`}>
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
              <th>Sem compra</th>
              <th>Sem alfândega</th>
              <th>Sem envio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Soma</td>
              <td className="num">{brl(summary.vendas)}</td>
              <td className="num">{brl(summary.custoTotal)}</td>
              <td className={`num ${summary.resultado < 0 ? "text-danger" : "text-ok"}`}>{brl(summary.resultado)}</td>
              <td className={`num ${summary.semCompra ? "text-danger" : ""}`}>
                <Link className="underline" href={`/financeiro?month=${month}&falta=compra`}>
                  {summary.semCompra}
                </Link>
              </td>
              <td className={`num ${summary.semAlfandega ? "text-danger" : ""}`}>
                <Link className="underline" href={`/financeiro?month=${month}&falta=alfandega`}>
                  {summary.semAlfandega}
                </Link>
              </td>
              <td className={`num ${summary.semEnvio ? "text-danger" : ""}`}>
                <Link className="underline" href={`/financeiro?month=${month}&falta=envio`}>
                  {summary.semEnvio}
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
                <td className={`num ${slice.summary.semCompra ? "text-danger" : ""}`}>{slice.summary.semCompra}</td>
                <td className={`num ${slice.summary.semAlfandega ? "text-danger" : ""}`}>{slice.summary.semAlfandega}</td>
                <td className={`num ${slice.summary.semEnvio ? "text-danger" : ""}`}>{slice.summary.semEnvio}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.semCompra || summary.semAlfandega || summary.semEnvio ? (
          <p className="mt-3 text-sm text-danger">Pedido com venda e valor vazio entra no lucro como zero.</p>
        ) : null}
      </section>
    </div>
  );
}
