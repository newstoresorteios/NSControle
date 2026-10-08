import Link from "next/link";
import { addSheetRow } from "@/app/(painel)/pedidos/actions";
import { OrderSheet, type SheetMode, type SheetOrder } from "@/components/order-sheet";
import { PageSizeSelect } from "@/components/page-size-select";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACCENTS, PLAIN, idPresence, likePattern, orderDigits } from "@/lib/order-filters";

const PAGE_SIZES = [30, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 100;

function pageSizeOf(value: string | undefined) {
  const size = Number(value);
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE;
}

const ABAS: { id: SheetMode; label: string; hint: string }[] = [
  { id: "pedidos", label: "Pedidos", hint: "Compras em aberto: origem, comprado, CPF, taxa e entregue." },
  { id: "acompanhamento", label: "Acompanhamento", hint: "A enviar Vindi, a enviar e enviado, com o código de rastreio." },
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
  searchParams: Promise<{
    q?: string;
    numero?: string;
    nome?: string;
    idref?: string;
    com_id?: string;
    fila?: string;
    aba?: string;
    page?: string;
    tamanho?: string;
    erro?: string;
  }>;
}) {
  const params = await searchParams;
  const aba = resolveAba(params.aba, params.fila);
  const pageSize = pageSizeOf(params.tamanho);
  const page = Math.max(Number(params.page || 1), 1);
  const numero = (params.numero || "").trim();
  const nome = (params.nome || "").trim();
  const idref = (params.idref || "").trim();
  const comId = idPresence(params.com_id);
  const legacy = numero || nome || idref || comId ? "" : (params.q || "").trim();
  const numeroLike = likePattern(numero);
  const nomeLike = likePattern(nome);
  const idLike = likePattern(idref);
  const legacyLike = likePattern(legacy);
  const digits = orderDigits(numero);
  const textSearch = Boolean(numero || nome || idref || legacy);
  await requireTeam();
  const archive = aba === "entregues" && !textSearch;
  const sql = db();
  const filters: SheetFilters = {
    numero,
    nome,
    idref,
    legacy,
    numeroLike,
    nomeLike,
    idLike,
    legacyLike,
    digits,
    comId,
    textSearch,
    aba,
    fila: params.fila ?? "",
  };
  const [found, counted] = await Promise.all([
    sql<RawOrder[]>`
      select ${sql.unsafe(COLUMNS)}
      from ctl_orders
      ${sheetWhere(sql, filters)}
      ${sheetOrder(sql, archive)}
      limit ${pageSize}
      offset ${(page - 1) * pageSize}
    `,
    sql<{ total_count: number }[]>`
      select count(*)::int as total_count
      from ctl_orders
      ${sheetWhere(sql, filters)}
    `,
  ]);
  const count = counted[0]?.total_count ?? 0;
  const rows = found.map((order) => toSheetOrder(order));
  const pages = Math.max(Math.ceil((count ?? 0) / pageSize), 1);
  const hint = ABAS.find((item) => item.id === aba)?.hint;
  const listQuery = { aba, numero, nome, idref, com_id: comId, fila: params.fila, tamanho: pageSize };
  const filtering = Boolean(numero || nome || idref || comId || legacy || params.fila);
  const summary = filterSummary({ numero, nome, idref, comId, legacy, fila: params.fila });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="page-title">Pedidos</h1>
        <p className="text-muted">
          {count} no banco
          {summary ? ` · ${summary}` : ` · ${hint}`}
          {pages > 1 ? ` · página ${Math.min(page, pages)} de ${pages}` : ""}
          {" "}
          A edição grava ao sair do campo.
        </p>
      </div>
      {params.erro === "duplicado" ? (
        <p className="text-sm text-danger">Esse número já existe. A busca abaixo mostra a ficha.</p>
      ) : null}
      {params.erro === "salvar" || params.erro === "numero" ? (
        <p className="text-sm text-danger">Não foi possível incluir a linha.</p>
      ) : null}
      <nav className="flex flex-wrap gap-2">
        {ABAS.map((item) => (
          <Link
            key={item.id}
            href={href({ ...listQuery, aba: item.id })}
            className={item.id === aba ? "button" : "button secondary"}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form
        className="card grid items-end gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_8rem_7rem_auto]"
        action="/pedidos"
      >
        <label className="grid gap-1 text-sm">
          Número
          <input name="numero" defaultValue={numero || legacy} placeholder="26312" autoComplete="off" />
        </label>
        <label className="grid gap-1 text-sm">
          Nome
          <input name="nome" defaultValue={nome} placeholder="produto" autoComplete="off" />
        </label>
        <label className="grid gap-1 text-sm">
          ID
          <input name="idref" defaultValue={idref} placeholder="código" autoComplete="off" />
        </label>
        <label className="grid gap-1 text-sm">
          Tem ID
          <select name="com_id" defaultValue={comId}>
            <option value="">Todos</option>
            <option value="com">Com ID</option>
            <option value="sem">Sem ID</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Por página
          <PageSizeSelect value={pageSize} />
        </label>
        <input type="hidden" name="aba" value={aba} />
        {params.fila ? <input type="hidden" name="fila" value={params.fila} /> : null}
        <div className="flex gap-2">
          <button type="submit">Buscar</button>
          {filtering ? (
            <Link className="button secondary" href={href({ aba, tamanho: pageSize })}>
              Limpar
            </Link>
          ) : null}
        </div>
      </form>
      {aba === "pedidos" && !textSearch && !comId ? (
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
      <OrderSheet
        rows={rows}
        mode={aba}
        emptyLabel={filtering ? "Nenhum pedido com esses filtros." : undefined}
      />
      {pages > 1 ? (
        <div className="flex gap-3 text-sm">
          {page > 1 ? (
            <Link className="button secondary" href={href({ ...listQuery, page: page - 1 })}>
              Anterior
            </Link>
          ) : null}
          <span className="self-center text-muted">
            {rows.length} nesta página · {count} no banco
          </span>
          {page < pages ? (
            <Link className="button secondary" href={href({ ...listQuery, page: page + 1 })}>
              Próxima
            </Link>
          ) : null}
        </div>
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

type SheetFilters = {
  numero: string;
  nome: string;
  idref: string;
  legacy: string;
  numeroLike: string;
  nomeLike: string;
  idLike: string;
  legacyLike: string;
  digits: string;
  comId: "" | "com" | "sem";
  textSearch: boolean;
  aba: SheetMode;
  fila: string;
};

type SqlTag = ReturnType<typeof db>;

function sheetWhere(sql: SqlTag, filters: SheetFilters) {
  return sql`
    where true
    ${numeroClause(sql, filters)}
    ${nomeClause(sql, filters)}
    ${idClause(sql, filters)}
    ${legacyClause(sql, filters)}
    ${idPresenceClause(sql, filters)}
    ${abaClause(sql, filters)}
    ${filaClause(sql, filters)}
  `;
}

function numeroClause(sql: SqlTag, filters: SheetFilters) {
  if (!filters.numero) return sql``;
  const folded = sql`translate(lower(coalesce(label, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.numeroLike}`;
  if (!filters.digits) {
    return sql`and (order_key ilike ${filters.numeroLike} or ${folded})`;
  }
  return sql`and (order_key ilike ${filters.numeroLike} or ${folded} or order_key = ${filters.digits})`;
}

function nomeClause(sql: SqlTag, filters: SheetFilters) {
  if (!filters.nome) return sql``;
  return sql`and translate(lower(coalesce(product_name, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.nomeLike}`;
}

function idClause(sql: SqlTag, filters: SheetFilters) {
  if (!filters.idref) return sql``;
  return sql`and translate(lower(coalesce(supplier_ref, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.idLike}`;
}

function legacyClause(sql: SqlTag, filters: SheetFilters) {
  if (!filters.legacy) return sql``;
  return sql`and (
    order_key ilike ${filters.legacyLike}
    or translate(lower(coalesce(label, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.legacyLike}
    or translate(lower(coalesce(product_name, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.legacyLike}
    or translate(lower(coalesce(supplier_ref, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.legacyLike}
    or tracking_code ilike ${filters.legacyLike}
    or translate(lower(coalesce(origin, '')), ${ACCENTS}, ${PLAIN}) ilike ${filters.legacyLike}
  )`;
}

function idPresenceClause(sql: SqlTag, filters: SheetFilters) {
  if (filters.comId === "com") return sql`and nullif(btrim(coalesce(supplier_ref, '')), '') is not null`;
  if (filters.comId === "sem") return sql`and nullif(btrim(coalesce(supplier_ref, '')), '') is null`;
  return sql``;
}

function abaClause(sql: SqlTag, filters: SheetFilters) {
  if (filters.textSearch) return sql``;
  if (filters.aba === "pedidos") {
    return sql`and delivered = false and (origin is not null or tray_modified_at is not null)`;
  }
  if (filters.aba === "acompanhamento") {
    return sql`and commercial_status in ('A ENVIAR VINDI', 'A ENVIAR', 'ENVIADO')`;
  }
  if (filters.aba === "rastreio") return sql`and delivered = false and tracking_code is not null`;
  return sql`and delivered = true`;
}

function filaClause(sql: SqlTag, filters: SheetFilters) {
  if (filters.fila === "devolucao") return sql`and tracking_situation ilike '%DEVOLU%'`;
  if (filters.fila === "alfandega") return sql`and tracking_situation ilike '%ALF%'`;
  if (filters.fila === "sem_retorno") return sql`and tracking_situation ilike '%Sem retorno%'`;
  if (filters.fila === "vindi") return sql`and commercial_status = 'A ENVIAR VINDI'`;
  return sql``;
}

function sheetOrder(sql: SqlTag, archive: boolean) {
  if (archive) return sql`order by updated_at desc nulls last, coalesce(label, order_key)`;
  return sql`
    order by
      case when order_key ~ '^[0-9]+$' then 0 else 1 end,
      case when order_key ~ '^[0-9]+$' then order_key::numeric end desc nulls last,
      coalesce(label, order_key)
  `;
}

function resolveAba(aba: string | undefined, fila: string | undefined): SheetMode {
  if (aba === "pedidos" || aba === "acompanhamento" || aba === "rastreio" || aba === "entregues") return aba;
  if (fila === "vindi") return "acompanhamento";
  if (fila) return "rastreio";
  return "pedidos";
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

function filterSummary(filters: {
  numero: string;
  nome: string;
  idref: string;
  comId: string;
  legacy: string;
  fila?: string;
}) {
  if (filters.fila) return FILAS[filters.fila] || filters.fila;
  const parts = [
    filters.numero ? `número ${filters.numero}` : "",
    filters.nome ? `nome ${filters.nome}` : "",
    filters.idref ? `ID ${filters.idref}` : "",
    filters.comId === "com" ? "com ID" : "",
    filters.comId === "sem" ? "sem ID" : "",
    filters.legacy ? "busca" : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function href(params: {
  numero?: string;
  nome?: string;
  idref?: string;
  com_id?: string;
  fila?: string;
  aba?: string;
  page?: number;
  tamanho?: number;
}) {
  const search = new URLSearchParams();
  if (params.aba) search.set("aba", params.aba);
  if (params.numero) search.set("numero", params.numero);
  if (params.nome) search.set("nome", params.nome);
  if (params.idref) search.set("idref", params.idref);
  if (params.com_id === "com" || params.com_id === "sem") search.set("com_id", params.com_id);
  if (params.fila) search.set("fila", params.fila);
  if (params.tamanho && params.tamanho !== DEFAULT_PAGE_SIZE) search.set("tamanho", String(params.tamanho));
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/pedidos?${query}` : "/pedidos";
}
