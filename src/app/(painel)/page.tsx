import Link from "next/link";
import { syncCorreiosNow } from "@/app/(painel)/correios-actions";
import { syncTrayNow } from "@/app/(painel)/tray-actions";
import { SyncButton, SyncStatus } from "@/components/sync-button";
import { correiosConfigured } from "@/lib/correios-client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl } from "@/lib/format";
import { trayConfigured } from "@/lib/tray-client";

const QUEUES = [
  { id: "devolucao", label: "Devolução", hint: "objeto voltando ou já devolvido" },
  { id: "alfandega", label: "Alfândega", hint: "parado em fiscalização" },
  { id: "sem_retorno", label: "Sem retorno", hint: "rastreio sem atualização" },
  { id: "vindi", label: "A enviar Vindi", hint: "pagamento ainda não enviado" },
] as const;

function syncDetail(
  sync: { last_run_at: string | null; last_report: { upserted?: number; cancellations?: number } | null } | null,
) {
  const when = sync?.last_run_at
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(sync.last_run_at))
    : null;
  const report = sync?.last_report;
  if (!when) return "Ainda não houve leitura da loja.";
  return `Última leitura ${when}${report?.upserted != null ? ` · ${report.upserted} pedidos` : ""}${report?.cancellations ? ` · ${report.cancellations} cancelamentos` : ""}.`;
}

function trayNotice(sync?: string, pedidos?: string): { message: string; tone: "ok" | "danger" | "muted" } | null {
  if (!sync || !SYNC_MESSAGE[sync]) return null;
  if (sync === "ok") {
    const count = Number(pedidos ?? 0);
    const saved =
      count > 0
        ? `${count} ${count === 1 ? "pedido gravado" : "pedidos gravados"}.`
        : "Nenhum pedido novo nesta rodada.";
    return { message: `Loja atualizada. ${saved}`, tone: "ok" };
  }
  const tone = sync === "erro" || sync === "nao_configurado" || sync === "limite" ? "danger" : "muted";
  return { message: SYNC_MESSAGE[sync], tone };
}

async function queueCount(id: (typeof QUEUES)[number]["id"]) {
  const sql = db();
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n
    from ctl_orders
    where
      (${id} <> 'devolucao' or tracking_situation ilike '%DEVOLU%')
      and (${id} <> 'alfandega' or tracking_situation ilike '%ALF%')
      and (${id} <> 'sem_retorno' or tracking_situation ilike '%Sem retorno%')
      and (${id} <> 'vindi' or commercial_status = 'A ENVIAR VINDI')
  `;
  return rows[0]?.n ?? 0;
}

function correiosLine(
  sync: { last_run_at: string | null; last_report: { updated?: number; missing?: number } | null } | null,
  notice?: string,
  rastreios?: string,
) {
  const flash = notice ? CORREIOS_MESSAGE[notice] : null;
  const extra = notice === "ok" && rastreios && rastreios !== "0" ? ` ${rastreios} status gravados.` : "";
  const when = sync?.last_run_at
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(sync.last_run_at))
    : null;
  const report = sync?.last_report;
  const detail = when
    ? `Última leitura dos Correios ${when}${report?.updated != null ? ` · ${report.updated} status` : ""}${report?.missing ? ` · ${report.missing} fora do contrato` : ""}.`
    : "Ainda não houve leitura dos Correios.";
  return [flash ? `${flash}${extra}` : null, detail].filter(Boolean).join(" ");
}

const CORREIOS_MESSAGE: Record<string, string> = {
  ok: "Rastreios atualizados.",
  aguardando: "Uma leitura dos Correios já está em andamento.",
  limite: "Os Correios pediram uma pausa.",
  erro: "Não foi possível falar com a API Rastro.",
  nao_configurado: "Falta usuário, senha ou cartão de postagem dos Correios.",
};

const SYNC_MESSAGE: Record<string, string> = {
  ok: "Loja atualizada.",
  aguardando: "Uma atualização já está em andamento.",
  limite: "A Tray pediu uma pausa. A próxima rodada continua de onde parou.",
  erro: "Não foi possível falar com o TRAYadaptor.",
  nao_configurado: "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; pedidos?: string; correios?: string; rastreios?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const configured = trayConfigured();
  const correiosReady = correiosConfigured();
  const sql = db();
  const [syncRows, correiosRows, counts, alerts, recent] = await Promise.all([
    sql<{ last_run_at: string | null; last_status: string | null; last_report: { upserted?: number; cancellations?: number } | null }[]>`
      select last_run_at, last_status, last_report from ctl_tray_sync
      where id = 'orders'
      limit 1
    `,
    sql<{ last_run_at: string | null; last_report: { updated?: number; missing?: number } | null }[]>`
      select last_run_at, last_report from ctl_tray_sync
      where id = 'correios'
      limit 1
    `,
    Promise.all(QUEUES.map((queue) => queueCount(queue.id))),
    sql<{ id: string; label: string | null; order_key: string; tracking_situation: string | null; tracking_correios: string | null; tracking_code: string | null; origin: string | null; shipping_cost: string | null; import_tax: string | null }[]>`
      select id, label, order_key, tracking_situation, tracking_correios, tracking_code, origin, shipping_cost, import_tax
      from ctl_orders
      where tracking_situation ilike '%DEVOLU%'
        or tracking_situation ilike '%ALF%'
        or tracking_situation ilike '%PROBLEMA%'
        or tracking_situation ilike '%Sem retorno%'
      order by tracking_event_at desc nulls last
      limit 12
    `,
    sql<{ id: string; order_key: string; label: string | null; origin: string | null; product_name: string | null; commercial_status: string | null; sale_amount: string | null }[]>`
      select id, order_key, label, origin, product_name, commercial_status, sale_amount
      from ctl_orders
      where order_key ~ '^[0-9]{4,6}$'
      order by order_key::numeric desc
      limit 15
    `,
  ]);
  const sync = syncRows[0] ?? null;
  const correios = correiosRows[0] ?? null;
  const trayResult = trayNotice(params.sync, params.pedidos);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="page-title">Filas do dia</h1>
        <p className="text-muted">O que precisa de ação antes do restante da planilha.</p>
      </div>
      <section className="card flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="section-title">Loja Tray</h2>
          <p className="max-w-3xl text-sm text-muted">
            Pedidos da loja entram pelo TRAYadaptor enquanto o painel está aberto. Cada rodada grava até 15 pedidos.
            O frete cobrado na loja entra no custo de envio. Custo de compra, taxa de importação, estoque físico e compras de clientes continuam neste controle.
          </p>
          <p className="mt-2 text-sm">{configured ? syncDetail(sync) : "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN."}</p>
        </div>
        {configured ? (
          <form action={syncTrayNow} className="grid justify-items-end gap-2">
            <SyncButton idle="Atualizar agora" pendingLabel="Atualizando…" />
            <SyncStatus pendingLabel="Lendo a loja…" message={trayResult?.message ?? null} tone={trayResult?.tone ?? "muted"} />
          </form>
        ) : null}
      </section>
      <section className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title">Pedidos carregados</h2>
            <p className="mt-1 text-sm text-muted">Os números mais altos da loja, do mais novo para o mais antigo.</p>
          </div>
          <Link className="button secondary" href="/pedidos">
            Abrir lista
          </Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Status</th>
              <th>Produto</th>
              <th>Origem</th>
              <th>Venda</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/pedidos/${order.id}`} className="num underline">
                    {order.order_key}
                  </Link>
                </td>
                <td>{order.commercial_status || "—"}</td>
                <td>{order.product_name || order.label || "—"}</td>
                <td>{order.origin || "—"}</td>
                <td className="num">{brl(order.sale_amount)}</td>
              </tr>
            ))}
            {!recent.length ? (
              <tr>
                <td colSpan={5}>Nenhum pedido numérico carregado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUEUES.map((queue, index) => (
          <Link key={queue.id} href={`/pedidos?fila=${queue.id}`} className="card stat block">
            <p className="kicker">{queue.label}</p>
            <p className="num mt-2 text-4xl font-medium tracking-tight">{counts[index]}</p>
            <p className="mt-1 text-sm text-muted">{queue.hint}</p>
          </Link>
        ))}
      </section>
      <section className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title">Alertas de rastreio</h2>
            <p className="mt-1 text-sm text-muted">
              {correiosReady
                ? correiosLine(correios, params.correios, params.rastreios)
                : "Falta usuário, senha ou cartão de postagem dos Correios."}
            </p>
          </div>
          {correiosReady ? (
            <form action={syncCorreiosNow}>
              <button type="submit">Atualizar rastreios</button>
            </form>
          ) : null}
        </div>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Origem</th>
              <th>Rastreio</th>
              <th>Situação</th>
              <th>Custo de envio</th>
              <th>Taxa alfandegária</th>
            </tr>
          </thead>
          <tbody>
            {(alerts ?? []).map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/pedidos/${order.id}`} className="num underline">
                    {/^\d{4,6}$/.test(order.order_key) ? order.order_key : order.label || order.order_key}
                  </Link>
                </td>
                <td>{order.origin || "—"}</td>
                <td className="num">{order.tracking_code || "—"}</td>
                <td>
                  <div>{order.tracking_situation || "—"}</div>
                  {order.tracking_correios && order.tracking_correios !== order.tracking_situation ? (
                    <div className="text-sm text-muted">{order.tracking_correios}</div>
                  ) : null}
                </td>
                <td className="num">{brl(order.shipping_cost)}</td>
                <td className="num">{brl(order.import_tax)}</td>
              </tr>
            ))}
            {!alerts?.length ? (
              <tr>
                <td colSpan={6}>Nenhum alerta importado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
