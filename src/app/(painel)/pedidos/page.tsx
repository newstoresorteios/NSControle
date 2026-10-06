import Link from "next/link";
import { addSheetRow } from "@/app/(painel)/pedidos/actions";
import { OrderSheet, type SheetMode, type SheetOrder } from "@/components/order-sheet";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

const PAGE_SIZE = 60;

const ABAS: { id: SheetMode; label: string; hint: string }[] = [
  { id: "pedidos", label: "Pedidos", hint: "Compras em aberto: origem, comprado, CPF, taxa e entregue." },
  { id: "acompanhamento", label: "Acompanhamento", hint: "A enviar Vindi, a enviar e enviado." },
  { id: "rastreio", label: "Rastreio", hint: "Códigos que ainda não foram marcados como entregues." },
  { id: "entregues", label: "Entregues", hint: "Arquivo. Desmarcar Entregue devolve o pedido para a lista aberta." },
];

const FILAS: Record<string, string> = {
  devolucao: "Devolução",
  alfandega: "Alfândega",
  sem_retorno: "Sem retorno",
  vindi: "A enviar Vindi",
};

const COLUMNS =
  "id, label, order_key, origin, product_name, supplier_ref, purchased, cpf_linked, tax_paid, delivered, tracking_code, tracking_situation, tracking_alert, tracking_correios, tracking_event_at, purchase_date, payment_date, commercial_status, supplier_days, notes_internal, notes_robot, notes_human";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fila?: string; aba?: string; page?: string; erro?: string }>;
}) {
  const params = await searchParams;
  const aba = resolveAba(params.aba, params.fila);
  const page = Math.max(Number(params.page || 1), 1);
  const q = (params.q || "").trim();
  await requireTeam();
  const safe = q.replace(/[%*,]/g, "");
  const like = `%${safe}%`;
  const paginate = aba === "entregues" && !q;
  const found = await db()<Array<RawOrder & { total_count: number }>>`
    select ${db().unsafe(COLUMNS)}, count(*) over()::int as total_count
    from ctl_orders
    where (
      ${q} = ''
      or order_key ilike ${like}
      or label ilike ${like}
      or product_name ilike ${like}
      or reference ilike ${like}
      or tracking_code ilike ${like}
      or origin ilike ${like}
      or supplier_ref ilike ${like}
      or notes_human ilike ${like}
    )
    and (${q} <> '' or ${aba} <> 'pedidos' or (delivered = false and origin is not null))
    and (${q} <> '' or ${aba} <> 'acompanhamento' or commercial_status in ('A ENVIAR VINDI', 'A ENVIAR', 'ENVIADO'))
    and (${q} <> '' or ${aba} <> 'rastreio' or (delivered = false and tracking_code is not null))
    and (${q} <> '' or ${aba} <> 'entregues' or delivered = true)
    and (${params.fila ?? ""} <> 'devolucao' or tracking_situation ilike '%DEVOLU%')
    and (${params.fila ?? ""} <> 'alfandega' or tracking_situation ilike '%ALF%')
    and (${params.fila ?? ""} <> 'sem_retorno' or tracking_situation ilike '%Sem retorno%')
    and (${params.fila ?? ""} <> 'vindi' or commercial_status = 'A ENVIAR VINDI')
    order by case when ${paginate} then updated_at end desc nulls last
    limit ${paginate ? PAGE_SIZE : 500}
    offset ${paginate ? (page - 1) * PAGE_SIZE : 0}
  `;
  const count = found[0]?.total_count ?? 0;
  const rows = found.map((order) => toSheetOrder(order));
  if (!(aba === "entregues" && !q)) rows.sort(compareOrders);
  const pages = Math.max(Math.ceil((count ?? 0) / PAGE_SIZE), 1);
  const hint = ABAS.find((item) => item.id === aba)?.hint;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="text-[#6d645b]">
          {count ?? 0} linhas
          {params.fila ? ` · ${FILAS[params.fila] || params.fila}` : q ? " · busca na base inteira" : ` · ${hint}`}
          {" "}
          A edição grava ao sair do campo.
        </p>
      </div>
      {params.erro === "duplicado" ? (
        <p className="text-sm text-[#8f3d2b]">Esse número já existe. A busca abaixo mostra a ficha.</p>
      ) : null}
      {params.erro === "salvar" || params.erro === "numero" ? (
        <p className="text-sm text-[#8f3d2b]">Não foi possível incluir a linha.</p>
      ) : null}
      <nav className="flex flex-wrap gap-2">
        {ABAS.map((item) => (
          <Link
            key={item.id}
            href={href({ ...params, aba: item.id, page: undefined })}
            className={item.id === aba ? "button" : "button secondary"}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form className="card grid items-center gap-3 md:grid-cols-[1fr_auto_auto]" action="/pedidos">
        <input name="q" defaultValue={q} placeholder="Número, produto, origem, ID ou rastreio" />
        <input type="hidden" name="aba" value={aba} />
        {params.fila ? <input type="hidden" name="fila" value={params.fila} /> : null}
        <button type="submit">Buscar</button>
        {params.fila ? (
          <Link className="button secondary text-center" href={href({ q, aba })}>
            Limpar fila
          </Link>
        ) : null}
      </form>
      {aba === "pedidos" && !q ? (
        <form action={addSheetRow} className="card grid items-end gap-3 md:grid-cols-[1fr_12rem_1fr_auto]">
          <label className="grid gap-1 text-sm">
            Nova linha
            <input name="label" required placeholder="Pedido 26000" />
          </label>
          <label className="grid gap-1 text-sm">
            Origem
            <input name="origin" list="origens" required placeholder="Japão" />
          </label>
          <label className="grid gap-1 text-sm">
            Produto
            <input name="product_name" placeholder="opcional" />
          </label>
          <button type="submit">Incluir</button>
        </form>
      ) : null}
      <OrderSheet rows={rows} mode={aba} />
      {aba === "entregues" && !q ? (
        <div className="flex gap-3 text-sm">
          {page > 1 ? (
            <Link className="button secondary" href={href({ ...params, aba, page: page - 1 })}>
              Anterior
            </Link>
          ) : null}
          <span className="self-center text-[#6d645b]">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link className="button secondary" href={href({ ...params, aba, page: page + 1 })}>
              Próxima
            </Link>
          ) : null}
        </div>
      ) : null}
      {rows.length < (count ?? 0) && !(aba === "entregues" && !q) ? (
        <p className="text-sm text-[#6d645b]">Mostrando {rows.length} de {count}. Use a busca para achar o restante.</p>
      ) : null}
    </div>
  );
}

type RawOrder = Omit<SheetOrder, "tracking_event_local" | "days_open"> & {
  tracking_event_at: string | null;
};

function toSheetOrder(order: RawOrder): SheetOrder {
  return {
    ...order,
    tracking_event_local: saoPauloLocal(order.tracking_event_at),
    days_open: daysSince(order.purchase_date),
  };
}

function resolveAba(aba: string | undefined, fila: string | undefined): SheetMode {
  if (aba === "pedidos" || aba === "acompanhamento" || aba === "rastreio" || aba === "entregues") return aba;
  if (fila === "vindi") return "acompanhamento";
  if (fila) return "rastreio";
  return "pedidos";
}

function compareOrders(a: SheetOrder, b: SheetOrder) {
  const group = (key: string) => (/^\d+$/.test(key) ? 1 : 0);
  const ga = group(a.order_key);
  const gb = group(b.order_key);
  if (ga !== gb) return ga - gb;
  if (ga === 1) return Number(b.order_key) - Number(a.order_key);
  return (a.label || a.order_key).localeCompare(b.label || b.order_key, "pt-BR");
}

function daysSince(value: string | null) {
  if (!value) return null;
  const start = new Date(`${String(value).slice(0, 10)}T00:00:00-03:00`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayDay - startDay) / 86400000);
}

function saoPauloLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function href(params: { q?: string; fila?: string; aba?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.aba) search.set("aba", params.aba);
  if (params.q) search.set("q", params.q);
  if (params.fila) search.set("fila", params.fila);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/pedidos?${query}` : "/pedidos";
}
