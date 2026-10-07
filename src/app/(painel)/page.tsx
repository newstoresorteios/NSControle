import Link from "next/link";
import { syncCorreiosNow } from "@/app/(painel)/correios-actions";
import { syncTrayNow } from "@/app/(painel)/tray-actions";
import { SyncButton, SyncStatus } from "@/components/sync-button";
import { correiosConfigured } from "@/lib/correios-client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthSummary } from "@/lib/finance";
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

const CORREIOS_MESSAGE: Record<string, string> = {
  ok: "Rastreios atualizados.",
  aguardando: "Uma leitura dos Correios já está em andamento.",
  limite: "Os Correios pediram uma pausa.",
  erro: "Não foi possível falar com a API Rastro.",
  nao_configurado: "Falta usuário, senha ou cartão de postagem dos Correios.",
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

function correiosLine(sync: { last_run_at: string | null; last_report: { updated?: number; missing?: number } | null } | null) {
  const stamp = readStamp(sync?.last_run_at ?? null);
  if (!stamp) return "Ainda não houve leitura dos Correios.";
  const updated = sync?.last_report?.updated;
  const status =
    updated == null ? "" : updated === 0 ? " Nenhum status novo." : updated === 1 ? " 1 status novo." : ` ${updated} status novos.`;
  const missing = sync?.last_report?.missing ?? 0;
  const outside = missing > 0 ? ` ${missing} fora do contrato.` : "";
  return `Correios lidos ${stamp}.${status}${outside}`;
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

function correiosNotice(sync?: string, rastreios?: string): { message: string; tone: "ok" | "danger" | "muted" } | null {
  if (!sync || !CORREIOS_MESSAGE[sync]) return null;
  if (sync === "ok") {
    const count = Number(rastreios ?? 0);
    const saved =
      count > 0 ? `${count} ${count === 1 ? "status gravado" : "status gravados"}.` : "Nenhum status novo nesta rodada.";
    return { message: `Rastreios atualizados. ${saved}`, tone: "ok" };
  }
  const tone = sync === "erro" || sync === "nao_configurado" || sync === "limite" ? "danger" : "muted";
  return { message: CORREIOS_MESSAGE[sync], tone };
}

function orderNumber(orderKey: string, label: string | null) {
  return /^\d{4,6}$/.test(orderKey) ? orderKey : label || orderKey;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; pedidos?: string; correios?: string; rastreios?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const configured = trayConfigured();
  const correiosReady = correiosConfigured();
  const month = saoPauloMonth();
  const monthDate = `${month}-01`;
  const sql = db();
  const [syncRows, correiosRows, countRows, alerts, goalRows, moneyRows] = await Promise.all([
    sql<{ last_run_at: string | null; last_report: { upserted?: number; cancellations?: number } | null }[]>`
      select last_run_at, last_report from ctl_tray_sync
      where id = 'orders'
      limit 1
    `,
    sql<{ last_run_at: string | null; last_report: { updated?: number; missing?: number } | null }[]>`
      select last_run_at, last_report from ctl_tray_sync
      where id = 'correios'
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
    sql<{
      id: string;
      label: string | null;
      order_key: string;
      tracking_situation: string | null;
      tracking_correios: string | null;
      tracking_alert: string | null;
      tracking_code: string | null;
    }[]>`
      select id, label, order_key, tracking_situation, tracking_correios, tracking_alert, tracking_code
      from ctl_orders
      where tracking_situation ilike '%DEVOLU%'
        or tracking_situation ilike '%ALF%'
        or tracking_situation ilike '%PROBLEMA%'
        or tracking_situation ilike '%Sem retorno%'
      order by
        case
          when tracking_situation ilike '%DEVOLU%' then 0
          when tracking_situation ilike '%PROBLEMA%' then 1
          when tracking_situation ilike '%ALF%' then 2
          else 3
        end,
        tracking_event_at desc nulls last
      limit 12
    `,
    sql<{ target_amount: string }[]>`
      select target_amount from ctl_monthly_goals
      where month = ${monthDate}
      limit 1
    `,
    sql<{
      flow: string;
      sale_amount: string | null;
      purchase_amount: string | null;
      payment_fee: string | null;
      shipping_cost: string | null;
      import_tax: string | null;
    }[]>`
      select flow, sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax
      from ctl_orders
      where finance_month = ${monthDate}
    `,
  ]);
  const tally = countRows[0];
  const counts = QUEUES.map((queue) => tally?.[queue.id] ?? 0);
  const sync = syncRows[0] ?? null;
  const correios = correiosRows[0] ?? null;
  const trayResult = trayNotice(params.sync, params.pedidos);
  const correiosResult = correiosNotice(params.correios, params.rastreios);
  const summary = monthSummary(moneyRows ?? [], asNumber(goalRows[0]?.target_amount), month);

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
            <h2 className="section-title">Casos</h2>
            <p className="mt-1 text-sm text-muted">
              {correiosReady ? correiosLine(correios) : "Falta usuário, senha ou cartão de postagem dos Correios."}
            </p>
          </div>
          {correiosReady ? (
            <form action={syncCorreiosNow} className="grid justify-items-end gap-2">
              <SyncButton idle="Atualizar rastreios" pendingLabel="Atualizando…" />
              <SyncStatus
                pendingLabel="Lendo os Correios…"
                message={correiosResult?.message ?? null}
                tone={correiosResult?.tone ?? "muted"}
              />
            </form>
          ) : null}
        </div>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Situação</th>
              <th>Alerta</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/pedidos/${order.id}`} className="num underline">
                    {orderNumber(order.order_key, order.label)}
                  </Link>
                  {order.tracking_code ? <div className="num text-sm text-muted">{order.tracking_code}</div> : null}
                </td>
                <td>{order.tracking_situation || "—"}</td>
                <td>
                  <div>{order.tracking_alert || order.tracking_correios || "—"}</div>
                  {order.tracking_alert && order.tracking_correios && order.tracking_alert !== order.tracking_correios ? (
                    <div className="text-sm text-muted">{order.tracking_correios}</div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!alerts.length ? (
              <tr>
                <td colSpan={3}>Nenhum caso de devolução, alfândega, problema ou sem retorno.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
              <th>Vendas do mês</th>
              <th>Falta para a meta</th>
              <th>Resultado</th>
              <th>Pedidos sem custo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">{brl(summary.vendasLojas)}</td>
              <td className="num">{brl(summary.falta)}</td>
              <td className="num text-ok">{brl(summary.resultado)}</td>
              <td className={`num ${summary.semCompra ? "text-danger" : ""}`}>{summary.semCompra}</td>
            </tr>
          </tbody>
        </table>
        {summary.semCompra ? (
          <p className="mt-3 text-sm text-danger">O resultado trata custo de compra vazio como zero.</p>
        ) : null}
      </section>
    </div>
  );
}
