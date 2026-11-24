import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { API_CALLS } from "@/lib/api-catalog";
import { FINANCE_STATUS_OUT, financeSlices, monthSummary } from "@/lib/finance";
import { asNumber } from "@/lib/format";

export function claudeConfigured() {
  return Boolean((process.env.CLAUDE_API_TOKEN || "").trim());
}

export function claudeAuthorized(request: Request) {
  const expected = (process.env.CLAUDE_API_TOKEN || "").trim();
  const header = request.headers.get("authorization") || "";
  const supplied = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function monthOf(value: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function money(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9_999_999) return null;
  return Math.round(value * 100) / 100;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function like(value: string) {
  return `%${value.replace(/[%_\\]/g, "").slice(0, 80)}%`;
}

function limitOf(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 200);
}

function orderNumber(value: string) {
  const folded = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const labeled = folded.match(/^pedido\s+(\d+)\b/);
  const bare = folded.match(/^(\d+)\b/);
  const key = labeled?.[1] || bare?.[1];
  return key ? { key, label: value.trim().slice(0, 120) } : null;
}

const LATE = `
  delivered = false
  and sale_amount is not null
  and nullif(btrim(coalesce(tracking_code, '')), '') is null
  and coalesce(commercial_status, '') !~* '${FINANCE_STATUS_OUT}'
  and coalesce(payment_date, purchase_date, created_at::date) <= (timezone('America/Sao_Paulo', now()))::date - 15
`;

export async function claudeGet(url: URL) {
  const recurso = url.searchParams.get("recurso") || "ajuda";
  const sql = db();
  if (recurso === "ajuda") {
    return {
      recursos: API_CALLS.filter((call) => call.method === "GET").map((call) => call.id),
      gravacao: API_CALLS.filter((call) => call.method === "POST").map((call) => call.id),
      pesquisa: "mes=AAAA-MM, pedido=número, q=trecho, limite=até 200",
    };
  }
  if (recurso === "estoque") return listStock(url);
  if (recurso === "notas") return listNotes(url);
  if (recurso === "pagamentos") return listPayments(url);
  if (recurso === "cancelamentos") return listCancellations(url);
  if (recurso === "compras") return listTradeIns(url);
  if (recurso === "financeiro") {
    const month = monthOf(url.searchParams.get("mes"));
    const orders = await sql<Array<{
      flow: string;
      order_key: string;
      label: string | null;
      origin: string | null;
      sale_amount: string | null;
      purchase_amount: string | null;
      payment_fee: string | null;
      shipping_cost: string | null;
      import_tax: string | null;
    }>>`
      select flow, order_key, label, origin, sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax
      from ctl_orders
      where finance_month = ${`${month}-01`}
        and coalesce(commercial_status, '') !~* ${FINANCE_STATUS_OUT}
        and (
          data_source is distinct from 'tray'
          or sale_amount is not null
          or payment_date is not null
        )
    `;
    const summary = monthSummary(orders, null, month);
    return {
      mes: month,
      venda: summary.vendas,
      compra: summary.custoCompra,
      frete: summary.frete,
      alfandega: summary.alfandega,
      taxa_pagamento: summary.taxaMaquina,
      custo: summary.custoTotal,
      lucro: summary.resultado,
      sem_compra: summary.semCompra,
      sem_alfandega: summary.semAlfandega,
      sem_envio: summary.semEnvio,
      loja_nova: summary.vendasLoja,
      loja_antiga: summary.vendasEncomenda,
      total: summary.vendasLojas,
      lojas: financeSlices(orders, month).map((slice) => ({
        loja: slice.label,
        venda: slice.summary.vendas,
        compra: slice.summary.custoCompra,
        frete: slice.summary.frete,
        alfandega: slice.summary.alfandega,
        taxa_pagamento: slice.summary.taxaMaquina,
        lucro: slice.summary.resultado,
      })),
    };
  }
  if (recurso === "sem-rastreio") {
    const rows = await sql.unsafe(`
      select order_key, label, product_name, commercial_status,
        coalesce(payment_date, purchase_date)::text as dia
      from ctl_orders
      where ${LATE}
      order by coalesce(payment_date, purchase_date) asc nulls last
      limit 200
    `);
    return { total: rows.length, pedidos: rows };
  }
  if (recurso === "pedidos") {
    const pedido = (url.searchParams.get("pedido") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();
    const month = url.searchParams.get("mes");
    const useMonth = !pedido && !q ? monthOf(month) : month && /^\d{4}-\d{2}$/.test(month) ? month : "";
    const start = useMonth ? `${useMonth}-01` : null;
    const next = useMonth
      ? new Date(Date.UTC(Number(useMonth.slice(0, 4)), Number(useMonth.slice(5, 7)), 1)).toISOString().slice(0, 10)
      : null;
    const needle = like(q || pedido);
    const rows = await sql`
      select order_key, label, origin, product_name, commercial_status, sale_amount, purchase_amount,
        payment_fee, shipping_cost, import_tax, tracking_code, payment_date, purchased
      from ctl_orders
      where coalesce(commercial_status, '') !~* ${FINANCE_STATUS_OUT}
        and (data_source is distinct from 'tray' or sale_amount is not null or payment_date is not null)
        and (
          ${useMonth === ""}
          or finance_month = ${start}
          or (
            finance_month is null
            and coalesce(payment_date, purchase_date) >= ${start}
            and coalesce(payment_date, purchase_date) < ${next}
          )
        )
        and (
          ${q || pedido} = ''
          or order_key ilike ${needle}
          or coalesce(label, '') ilike ${needle}
          or coalesce(product_name, '') ilike ${needle}
          or coalesce(tracking_code, '') ilike ${needle}
        )
      order by order_key desc
      limit ${limitOf(url.searchParams.get("limite"), 100)}
    `;
    return { mes: useMonth || null, total: rows.length, pedidos: rows };
  }
  return { erro: "recurso_desconhecido" };
}

async function listStock(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const marca = (url.searchParams.get("marca") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const needle = like(q);
  const rows = await db()`
    select id, brand, model, origin, tracking_code, sale_price, cost, location, status, notes, purchased_at
    from ctl_inventory_items
    where not exists (select 1 from ctl_integration_units u where u.inventory_id = ctl_inventory_items.id)
      and (${marca} = '' or coalesce(brand, '') ilike ${like(marca)})
      and (${status} = '' or coalesce(status, '') ilike ${like(status)})
      and (
        ${q} = ''
        or coalesce(brand, '') ilike ${needle}
        or model ilike ${needle}
        or coalesce(origin, '') ilike ${needle}
        or coalesce(tracking_code, '') ilike ${needle}
        or coalesce(location, '') ilike ${needle}
        or coalesce(notes, '') ilike ${needle}
      )
    order by brand, model
    limit ${limitOf(url.searchParams.get("limite"), 100)}
  `;
  const venda = rows.reduce((sum, row) => sum + (asNumber(row.sale_price) ?? 0), 0);
  const custo = rows.reduce((sum, row) => sum + (asNumber(row.cost) ?? 0), 0);
  return { total: rows.length, venda, custo, itens: rows };
}

async function listNotes(url: URL) {
  const month = url.searchParams.get("mes");
  const useMonth = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : "";
  const pedido = (url.searchParams.get("pedido") || "").trim();
  const rows = await db()`
    select month, line_no, order_key, label, platform, purchased, tracking_code,
      purchase_amount as compra, payment_fee as alfandega, shipping_cost as frete
    from ctl_intermediation_notes
    where (${useMonth === ""} or month = ${useMonth || null})
      and (${pedido} = '' or order_key ilike ${like(pedido)} or coalesce(label, '') ilike ${like(pedido)})
    order by month desc, line_no
    limit ${limitOf(url.searchParams.get("limite"), 100)}
  `;
  return { total: rows.length, notas: rows };
}

async function listPayments(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const rows = await db()`
    select id, supplier_name, invoice_number, invoice_date, currency, total_amount, due_date, due_amount, status
    from ctl_supplier_invoices
    where ${q} = ''
      or coalesce(supplier_name, '') ilike ${like(q)}
      or coalesce(invoice_number, '') ilike ${like(q)}
    order by created_at desc
    limit ${limitOf(url.searchParams.get("limite"), 50)}
  `;
  return { total: rows.length, faturas: rows };
}

async function listCancellations(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const rows = await db()`
    select order_key, model, amount, due_date, done_date, reason, status, gateway
    from ctl_cancellations
    where ${q} = ''
      or coalesce(order_key, '') ilike ${like(q)}
      or coalesce(model, '') ilike ${like(q)}
      or coalesce(status, '') ilike ${like(q)}
    order by coalesce(done_date, due_date) desc nulls last
    limit ${limitOf(url.searchParams.get("limite"), 100)}
  `;
  return { total: rows.length, cancelamentos: rows };
}

async function listTradeIns(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const rows = await db()`
    select client_name, code, model, condition, cost, invoice_received, delivered
    from ctl_trade_ins
    where ${q} = ''
      or client_name ilike ${like(q)}
      or coalesce(code, '') ilike ${like(q)}
      or coalesce(model, '') ilike ${like(q)}
    order by client_name
    limit ${limitOf(url.searchParams.get("limite"), 100)}
  `;
  return { total: rows.length, compras: rows };
}

async function createStock(body: Record<string, unknown>) {
  const model = text(body.modelo, 160);
  if (!model) return { status: 400, body: { ok: false, erro: "modelo_obrigatorio" } };
  const purchased = text(body.comprado_em, 10);
  if (purchased && !/^\d{4}-\d{2}-\d{2}$/.test(purchased)) return { status: 400, body: { ok: false, erro: "data_invalida" } };
  const sale = body.venda == null ? null : money(body.venda);
  const cost = body.custo == null ? null : money(body.custo);
  if (body.venda != null && sale == null) return { status: 400, body: { ok: false, erro: "venda_invalida" } };
  if (body.custo != null && cost == null) return { status: 400, body: { ok: false, erro: "custo_invalido" } };
  const [saved] = await db()`
    insert into ctl_inventory_items (
      brand, model, origin, tracking_code, sale_price, cost, location, status, notes, purchased_at
    ) values (
      ${text(body.marca, 80) || null},
      ${model},
      ${text(body.origem, 80) || null},
      ${text(body.rastreio, 80) || null},
      ${sale},
      ${cost},
      ${text(body.local, 80) || null},
      ${text(body.status, 40) || "Disponível"},
      ${text(body.observacao, 2000) || null},
      ${purchased || null}
    )
    returning id, brand, model, sale_price, cost, status
  `;
  revalidatePath("/estoque");
  return { status: 200, body: { ok: true, item: saved } };
}

async function createNote(body: Record<string, unknown>) {
  const month = text(body.mes, 7);
  const parsed = orderNumber(text(body.pedido, 120));
  if (!/^\d{4}-\d{2}$/.test(month) || !parsed) return { status: 400, body: { ok: false, erro: "mes_e_pedido_obrigatorios" } };
  const purchase = body.compra == null ? null : money(body.compra);
  const tax = body.alfandega == null ? null : money(body.alfandega);
  const freight = body.frete == null ? null : money(body.frete);
  if ((body.compra != null && purchase == null) || (body.alfandega != null && tax == null) || (body.frete != null && freight == null)) {
    return { status: 400, body: { ok: false, erro: "valor_invalido" } };
  }
  const platform = text(body.plataforma, 80) || null;
  const tracking = text(body.rastreio, 80) || null;
  const purchased = body.comprado === true;
  const sql = db();
  const [order] = await sql<{ id: string }[]>`
    select id from ctl_orders where order_key = ${parsed.key} order by finance_month desc nulls last limit 1
  `;
  const [next] = await sql<{ line_no: number }[]>`
    select coalesce(max(line_no), 0) + 1 as line_no from ctl_intermediation_notes where month = ${`${month}-01`}
  `;
  const line = Number(next?.line_no ?? 1);
  await sql`
    insert into ctl_intermediation_notes (
      month, line_no, order_key, label, platform, purchased, tracking_code,
      purchase_amount, payment_fee, shipping_cost, purchase_done, order_id
    ) values (
      ${`${month}-01`}, ${line}, ${parsed.key}, ${parsed.label}, ${platform}, ${purchased}, ${tracking},
      ${purchase}, ${tax}, ${freight}, ${purchase == null && tax == null && freight == null && purchased}, ${order?.id ?? null}
    )
  `;
  if (order) {
    await sql`
      update ctl_orders set
        purchase_amount = coalesce(purchase_amount, ${purchase}),
        import_tax = coalesce(import_tax, ${tax}),
        shipping_cost = coalesce(shipping_cost, ${freight}),
        origin = coalesce(nullif(btrim(origin), ''), ${platform}),
        tracking_code = coalesce(nullif(btrim(tracking_code), ''), ${tracking}),
        purchased = purchased or ${purchased}
      where id = ${order.id}
    `;
  }
  revalidatePath("/intermediacao");
  return { status: 200, body: { ok: true, mes: month, linha: line, pedido: parsed.key } };
}

export async function claudePost(body: Record<string, unknown>) {
  const recurso = text(body.recurso, 40) || "pedido";
  if (recurso === "estoque") return createStock(body);
  if (recurso === "nota") return createNote(body);
  if (recurso !== "pedido") return { status: 400, body: { ok: false, erro: "recurso_desconhecido" } };
  const key = typeof body.pedido === "string" ? body.pedido.trim() : "";
  if (!key) return { status: 400, body: { ok: false, erro: "pedido_obrigatorio" } };
  const fee = money(body.taxa_pagamento);
  const purchase = money(body.compra);
  const tax = money(body.alfandega);
  const freight = money(body.frete);
  const tracking = typeof body.rastreio === "string" ? body.rastreio.trim().slice(0, 80) : "";
  const origin = typeof body.origem === "string" ? body.origem.trim().slice(0, 80) : "";
  const note = typeof body.observacao === "string" ? body.observacao.trim().slice(0, 4000) : "";
  const purchased = typeof body.comprado === "boolean" ? body.comprado : null;
  const sql = db();
  const [order] = await sql<{ id: string }[]>`
    select id from ctl_orders
    where order_key = ${key} or label = ${key}
    order by finance_month desc nulls last
    limit 1
  `;
  if (!order) return { status: 404, body: { ok: false, erro: "pedido_nao_encontrado" } };
  const [saved] = await sql`
    update ctl_orders set
      payment_fee = coalesce(payment_fee, ${fee}),
      purchase_amount = coalesce(purchase_amount, ${purchase}),
      import_tax = coalesce(import_tax, ${tax}),
      shipping_cost = coalesce(shipping_cost, ${freight}),
      tracking_code = coalesce(nullif(btrim(tracking_code), ''), nullif(${tracking}, '')),
      origin = coalesce(nullif(btrim(origin), ''), nullif(${origin}, '')),
      notes_internal = coalesce(notes_internal, nullif(${note}, '')),
      purchased = purchased or ${purchased ?? false}
    where id = ${order.id}
    returning order_key, sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax, tracking_code, origin, purchased
  `;
  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  return { status: 200, body: { ok: true, pedido: saved, venda: asNumber(saved?.sale_amount) } };
}
