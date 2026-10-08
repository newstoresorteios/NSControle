export type MoneyLine = {
  id: string;
  kind: string;
  quantity: number | null;
  lineAmount: number | null;
  orderIds: string[];
};

export type OrderCost = {
  orderId: string;
  foreignAmount: number;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function paymentSummary(lines: MoneyLine[], totalForeign: number | null, rate: number | null) {
  const items = lines.reduce((sum, line) => sum + (line.kind === "produto" ? pieces(line.quantity) : 0), 0);
  const summed = roundMoney(lines.reduce((sum, line) => sum + amount(line.lineAmount), 0));
  const foreign = totalForeign == null ? summed : roundMoney(totalForeign);
  const brl = rate != null && rate > 0 ? roundMoney(foreign * rate) : null;
  const average = brl != null && items > 0 ? roundMoney(brl / items) : null;
  return { items, foreign, brl, average };
}

export function allocateInvoice(lines: MoneyLine[]): { lineForeign: Map<string, number>; orders: OrderCost[] } {
  const products = lines.filter((line) => line.kind === "produto" && amount(line.lineAmount) > 0);
  const fees = lines.filter((line) => line.kind === "taxa");
  const fee = fees.reduce((sum, line) => sum + amount(line.lineAmount), 0);
  const shares = feeShares(products.map((line) => amount(line.lineAmount)), fee);
  const lineForeign = new Map<string, number>();
  const orders = new Map<string, number>();

  products.forEach((line, index) => {
    const full = roundMoney(amount(line.lineAmount) + (shares[index] ?? 0));
    lineForeign.set(line.id, full);
    const parts = split(full, line.orderIds.length);
    line.orderIds.forEach((orderId, part) => add(orders, orderId, parts[part] ?? 0));
  });
  for (const line of fees) lineForeign.set(line.id, roundMoney(amount(line.lineAmount)));

  return {
    lineForeign,
    orders: [...orders].map(([orderId, foreignAmount]) => ({ orderId, foreignAmount: roundMoney(foreignAmount) })),
  };
}

function feeShares(amounts: number[], fee: number): number[] {
  if (!amounts.length || fee === 0) return amounts.map(() => 0);
  const sum = amounts.reduce((total, value) => total + value, 0);
  if (sum <= 0) return amounts.map(() => 0);
  const shares = amounts.map((value) => roundMoney((value / sum) * fee));
  const drift = roundMoney(fee - shares.reduce((total, value) => total + value, 0));
  shares[shares.length - 1] = roundMoney((shares[shares.length - 1] ?? 0) + drift);
  return shares;
}

function split(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  if (parts === 1) return [roundMoney(total)];
  const each = roundMoney(total / parts);
  const values = Array.from({ length: parts }, () => each);
  values[parts - 1] = roundMoney(total - each * (parts - 1));
  return values;
}

function add(totals: Map<string, number>, orderId: string, value: number) {
  totals.set(orderId, roundMoney((totals.get(orderId) ?? 0) + value));
}

function amount(value: number | null): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function pieces(value: number | null): number {
  return value != null && value > 0 ? value : 0;
}
