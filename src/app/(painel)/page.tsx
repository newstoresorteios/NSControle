import Link from "next/link";
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

function syncLine(
  sync: { last_run_at: string | null; last_status: string | null; last_report: { upserted?: number; cancellations?: number } | null } | null,
  notice?: string,
  pedidos?: string,
) {
  const flash = notice && notice !== "aguardando" ? SYNC_MESSAGE[notice] : null;
  const extra = notice === "ok" && pedidos && pedidos !== "0" ? ` ${pedidos} pedidos gravados.` : "";
  const when = sync?.last_run_at
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(sync.last_run_at))
    : null;
  const report = sync?.last_report;
  const detail = when
    ? `Última leitura ${when}${report?.upserted != null ? ` · ${report.upserted} pedidos` : ""}${report?.cancellations ? ` · ${report.cancellations} cancelamentos` : ""}.`
    : "Ainda não houve leitura da loja.";
  return [flash ? `${flash}${extra}` : null, detail].filter(Boolean).join(" ");
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
  searchParams: Promise<{ sync?: string; pedidos?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const configured = trayConfigured();
  const sql = db();
  const [syncRows, counts, alerts] = await Promise.all([
    sql<{ last_run_at: string | null; last_status: string | null; last_report: { upserted?: number; cancellations?: number } | null }[]>`
      select last_run_at, last_status, last_report from ctl_tray_sync
      where id in ('bi', 'orders')
      order by last_run_at desc nulls last
      limit 1
    `,
    Promise.all(QUEUES.map((queue) => queueCount(queue.id))),
    sql<{ id: string; label: string | null; order_key: string; tracking_situation: string | null; tracking_code: string | null; origin: string | null; shipping_cost: string | null; import_tax: string | null }[]>`
      select id, label, order_key, tracking_situation, tracking_code, origin, shipping_cost, import_tax
      from ctl_orders
      where tracking_situation ilike '%DEVOLU%'
        or tracking_situation ilike '%ALF%'
        or tracking_situation ilike '%PROBLEMA%'
        or tracking_situation ilike '%Sem retorno%'
      order by tracking_event_at desc nulls last
      limit 12
    `,
  ]);
  const sync = syncRows[0] ?? null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Filas do dia</h1>
        <p className="text-[#6d645b]">O que precisa de ação antes do restante da planilha.</p>
      </div>
      <section className="card flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold">Loja Tray</h2>
          <p className="max-w-3xl text-sm text-[#6d645b]">
            Pedidos, valor de venda, pagamento, rastreio e cancelamentos entram sozinhos a partir do TRAYadaptor, a cada 10 minutos.
            Custo de compra, taxa de importação, estoque físico e compras de clientes continuam neste controle.
          </p>
          <p className="mt-2 text-sm">{configured ? syncLine(sync, params.sync, params.pedidos) : "Falta TRAY_ADAPTER_URL ou TRAY_ADAPTER_TOKEN."}</p>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUEUES.map((queue, index) => (
          <Link key={queue.id} href={`/pedidos?fila=${queue.id}`} className="card block">
            <p className="text-sm text-[#6d645b]">{queue.label}</p>
            <p className="num mt-1 text-3xl font-semibold">{counts[index]}</p>
            <p className="mt-1 text-sm text-[#6d645b]">{queue.hint}</p>
          </Link>
        ))}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Alertas de rastreio</h2>
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
                  <Link href={`/pedidos/${order.id}`} className="underline">
                    {order.label || order.order_key}
                  </Link>
                </td>
                <td>{order.origin || "—"}</td>
                <td className="num">{order.tracking_code || "—"}</td>
                <td>{order.tracking_situation || "—"}</td>
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
