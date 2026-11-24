import { nationalShipment } from "./order-rules.ts";

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export type MoneyOrder = {
  flow: string;
  order_key?: string | null;
  label?: string | null;
  origin?: string | null;
  notes_internal?: string | null;
  sale_amount: unknown;
  purchase_amount: unknown;
  payment_fee: unknown;
  shipping_cost: unknown;
  import_tax: unknown;
};

export type FinanceSlice = {
  key: string;
  label: string;
  orders: number;
  summary: MonthSummary;
  complete: {
    count: number;
    vendas: number;
    custo: number;
    resultado: number;
    margem: number | null;
    retorno: number | null;
    markup: number | null;
    mediaGanhos: number | null;
  };
};

export type MonthSummary = {
  vendasEncomenda: number;
  vendasLoja: number;
  vendasCreditos: number;
  vendasLojas: number;
  vendas: number;
  custoCompra: number;
  frete: number;
  alfandega: number;
  taxaMaquina: number;
  taxas: number;
  custoTotal: number;
  resultado: number;
  margem: number | null;
  retorno: number | null;
  markup: number | null;
  mediaVenda: number | null;
  mediaCusto: number | null;
  mediaTaxa: number | null;
  mediaEnvio: number | null;
  semCompra: number;
  semTaxa: number;
  semAlfandega: number;
  semEnvio: number;
  mediaRealizada: number | null;
  mediaARealizar: number | null;
  falta: number | null;
  percentual: number | null;
  elapsed: number;
  daysInMonth: number;
};

export function trayStoreOf(order: { order_key: string; label?: string | null }): "687890" | "1490060" | null {
  const qualified = /^(\d+):(\d+)$/.exec(order.order_key);
  if (qualified?.[1] === "1490060" || (order.label || "").includes("1490060")) return "1490060";
  if (qualified) return null;
  return /^\d+$/.test(order.order_key) ? "687890" : null;
}

/** Loja nova do cabeçalho: pronta entrega, a loja NS Relógios. */
export function isSheetLojaNova(order: { order_key?: string | null; label?: string | null; origin?: string | null }): boolean {
  if ((order.origin ?? "").toLowerCase().includes("pronta entrega")) return true;
  return trayStoreOf({ order_key: String(order.order_key ?? ""), label: order.label }) === "1490060";
}

/** Status que a planilha não soma. Aguardando Vindi continua: a venda já está lançada. */
export const FINANCE_STATUS_OUT = "cancel|aguardando pagamento|aguardando confirm";

export function approvedFinanceOrder(order: {
  commercial_status?: string | null;
  data_source?: string | null;
  sale_amount?: unknown;
  payment_date?: string | null;
}): boolean {
  const status = (order.commercial_status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/cancel|aguardando pagamento|aguardando confirm/.test(status)) return false;
  const paid = asNumber(order.sale_amount) != null || Boolean(String(order.payment_date ?? "").trim());
  if ((order.data_source ?? "") === "tray" && !paid) return false;
  return true;
}

export function salesByTrayStore(orders: Array<MoneyOrder & { order_key: string; label?: string | null }>) {
  const totals: Record<"687890" | "1490060", number> = { "687890": 0, "1490060": 0 };
  for (const order of orders) {
    if (order.flow !== "loja_nova") continue;
    const store = trayStoreOf(order);
    if (!store) continue;
    totals[store] += asNumber(order.sale_amount) ?? 0;
  }
  return totals;
}

function sumSales(orders: MoneyOrder[]) {
  return orders.reduce((total, order) => total + (asNumber(order.sale_amount) ?? 0), 0);
}

function sum(orders: MoneyOrder[], flow: string | null, field: keyof MoneyOrder) {
  return orders
    .filter((order) => flow == null || order.flow === flow)
    .reduce((total, order) => total + (asNumber(order[field]) ?? 0), 0);
}

function average(orders: MoneyOrder[], field: keyof MoneyOrder) {
  const values = orders
    .map((order) => asNumber(order[field]))
    .filter((value): value is number => value != null);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function missing(orders: MoneyOrder[], field: keyof MoneyOrder) {
  return orders.filter((order) => {
    if (asNumber(order.sale_amount) == null || asNumber(order[field]) != null) return false;
    if (field === "import_tax" && nationalShipment(order)) return false;
    return true;
  }).length;
}

export function monthSummary(
  orders: MoneyOrder[],
  meta: number | null,
  month: string,
  today = new Date(),
): MonthSummary {
  const storeOrders = orders.filter((order) => order.flow === "loja_nova" || order.flow === "encomenda");
  const vendasLoja = sumSales(storeOrders.filter(isSheetLojaNova));
  const vendasEncomenda = sumSales(storeOrders);
  const vendasCreditos = sum(orders, "ns_creditos", "sale_amount");
  const vendasLojas = vendasLoja + vendasEncomenda;
  const vendas = vendasEncomenda + vendasCreditos;
  const custoCompra = sum(orders, null, "purchase_amount");
  const frete = sum(orders, null, "shipping_cost");
  const alfandega = sum(orders, null, "import_tax");
  const taxaMaquina = sum(orders, null, "payment_fee");
  const taxas = taxaMaquina + frete + alfandega;
  const custoTotal = custoCompra + taxas;
  const resultado = vendas - custoTotal;
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === mon;
  const elapsed = isCurrent ? Math.max(today.getDate(), 1) : daysInMonth;
  return {
    vendasEncomenda,
    vendasLoja,
    vendasCreditos,
    vendasLojas,
    vendas,
    custoCompra,
    frete,
    alfandega,
    taxaMaquina,
    taxas,
    custoTotal,
    resultado,
    margem: vendas > 0 ? resultado / vendas : null,
    retorno: custoTotal > 0 ? resultado / custoTotal : null,
    markup: custoTotal > 0 ? vendas / custoTotal : null,
    mediaVenda: average(orders, "sale_amount"),
    mediaCusto: average(orders, "purchase_amount"),
    mediaTaxa: average(orders, "payment_fee"),
    mediaEnvio: average(orders, "shipping_cost"),
    semCompra: missing(orders, "purchase_amount"),
    semTaxa: missing(orders, "payment_fee"),
    semAlfandega: missing(orders, "import_tax"),
    semEnvio: missing(orders, "shipping_cost"),
    mediaRealizada: elapsed ? vendasLojas / elapsed : null,
    mediaARealizar: meta != null && daysInMonth ? meta / daysInMonth : null,
    falta: meta != null ? meta - vendasLojas : null,
    percentual: meta ? vendasLojas / meta : null,
    elapsed,
    daysInMonth,
  };
}

export function marginOnComplete(orders: MoneyOrder[]) {
  const complete = orders.filter((order) => asNumber(order.sale_amount) != null && asNumber(order.purchase_amount) != null);
  const vendas = complete.reduce((total, order) => total + (asNumber(order.sale_amount) ?? 0), 0);
  const custo = complete.reduce(
    (total, order) =>
      total +
      (asNumber(order.purchase_amount) ?? 0) +
      (asNumber(order.payment_fee) ?? 0) +
      (asNumber(order.shipping_cost) ?? 0) +
      (asNumber(order.import_tax) ?? 0),
    0,
  );
  const resultado = vendas - custo;
  return {
    count: complete.length,
    vendas,
    custo,
    resultado,
    margem: vendas > 0 ? resultado / vendas : null,
    retorno: custo > 0 ? resultado / custo : null,
    markup: custo > 0 ? vendas / custo : null,
    mediaGanhos: complete.length ? resultado / complete.length : null,
  };
}

const EXTRA_FLOW: Record<string, string> = {
  ns_creditos: "NS Créditos",
};

export function financeSlices(
  orders: MoneyOrder[],
  month: string,
  today = new Date(),
): FinanceSlice[] {
  const buckets = new Map<string, { label: string; rows: MoneyOrder[] }>();
  const put = (key: string, label: string, order: MoneyOrder) => {
    const bucket = buckets.get(key) ?? { label, rows: [] };
    bucket.rows.push(order);
    buckets.set(key, bucket);
  };
  for (const order of orders) {
    if (order.flow === "loja_nova" || order.flow === "encomenda") {
      put("loja-antiga", "Loja antiga", order);
      if (isSheetLojaNova(order)) put("loja-nova", "Loja nova", order);
      continue;
    }
    put(`flow:${order.flow}`, EXTRA_FLOW[order.flow] ?? order.flow, order);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      orders: bucket.rows.filter((row) => asNumber(row.sale_amount) != null).length,
      summary: monthSummary(bucket.rows, null, month, today),
      complete: marginOnComplete(bucket.rows),
    }))
    .sort((a, b) => {
      const rank = (key: string) => (key === "loja-nova" ? 0 : key === "loja-antiga" ? 1 : 2);
      return rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, "pt");
    });
}
