function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export type MoneyOrder = {
  flow: string;
  sale_amount: unknown;
  purchase_amount: unknown;
  payment_fee: unknown;
  shipping_cost: unknown;
  import_tax: unknown;
};

export type MonthSummary = {
  vendasEncomenda: number;
  vendasLoja: number;
  vendasCreditos: number;
  vendasLojas: number;
  vendas: number;
  custoCompra: number;
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
  return orders.filter((order) => asNumber(order.sale_amount) != null && asNumber(order[field]) == null).length;
}

export function monthSummary(
  orders: MoneyOrder[],
  meta: number | null,
  month: string,
  today = new Date(),
): MonthSummary {
  const vendasEncomenda = sum(orders, "encomenda", "sale_amount");
  const vendasLoja = sum(orders, "loja_nova", "sale_amount");
  const vendasCreditos = sum(orders, "ns_creditos", "sale_amount");
  const vendasLojas = vendasEncomenda + vendasLoja;
  const vendas = vendasLojas + vendasCreditos;
  const custoCompra = sum(orders, null, "purchase_amount");
  const taxas =
    sum(orders, null, "payment_fee") +
    sum(orders, null, "shipping_cost") +
    sum(orders, null, "import_tax");
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
