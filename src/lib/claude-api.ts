import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { financeSlices, monthSummary } from "@/lib/finance";
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

const LATE = `
  delivered = false
  and sale_amount is not null
  and nullif(btrim(coalesce(tracking_code, '')), '') is null
  and coalesce(commercial_status, '') !~* 'aguard|cancel'
  and coalesce(payment_date, purchase_date, created_at::date) <= (timezone('America/Sao_Paulo', now()))::date - 15
`;

export async function claudeGet(url: URL) {
  const recurso = url.searchParams.get("recurso") || "ajuda";
  const sql = db();
  if (recurso === "ajuda") {
    return {
      recursos: ["pedidos", "financeiro", "sem-rastreio"],
      gravacao: "POST /api/claude com pedido e os campos a preencher",
    };
  }
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
    const month = monthOf(url.searchParams.get("mes"));
    const start = `${month}-01`;
    const [year, mon] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
    const rows = await sql`
      select order_key, label, origin, product_name, commercial_status, sale_amount, purchase_amount,
        payment_fee, shipping_cost, import_tax, tracking_code, payment_date, purchased
      from ctl_orders
      where coalesce(commercial_status, '') !~* 'aguard|cancel'
        and (data_source is distinct from 'tray' or sale_amount is not null or payment_date is not null)
        and (
          finance_month = ${start}
          or (
            finance_month is null
            and coalesce(payment_date, purchase_date) >= ${start}
            and coalesce(payment_date, purchase_date) < ${next}
          )
        )
      order by order_key desc
      limit 200
    `;
    return { mes: month, total: rows.length, pedidos: rows };
  }
  return { erro: "recurso_desconhecido" };
}

export async function claudePost(body: Record<string, unknown>) {
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
  return { status: 200, body: { ok: true, pedido: saved, venda: asNumber(saved?.sale_amount) } };
}
