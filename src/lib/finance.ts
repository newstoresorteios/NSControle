import { asNumber } from "@/lib/format";

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
  vendas: number;
  custoCompra: number;
  taxas: number;
  custoTotal: number;
  resultado: number;
  margem: number | null;
  markup: number | null;
  mediaRealizada: number | null;
  mediaARealizar: number | null;
  falta: number | null;
  percentual: number | null;
  elapsed: number;
  daysInMonth: number;
};

function sum(orders: MoneyOrder[], flow: string | null, field: keyof MoneyOrder) {
  return orders
    .filter((order) => flow == null || order.flow === flow)
    .reduce((total, order) => total + (asNumber(order[field]) ?? 0), 0);
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
  const vendas = vendasEncomenda + vendasLoja + vendasCreditos;
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
    vendas,
    custoCompra,
    taxas,
    custoTotal,
    resultado,
    margem: vendas > 0 ? resultado / vendas : null,
    markup: custoTotal > 0 ? vendas / custoTotal : null,
    mediaRealizada: elapsed ? vendas / elapsed : null,
    mediaARealizar: meta != null && daysInMonth ? meta / daysInMonth : null,
    falta: meta != null ? meta - vendas : null,
    percentual: meta ? vendas / meta : null,
    elapsed,
    daysInMonth,
  };
}
