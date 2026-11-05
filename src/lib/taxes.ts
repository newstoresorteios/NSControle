export type TaxQueueStatus = "sem_valor" | "a_pagar" | "paga";

export function taxPaymentText(input: {
  orderKey: string;
  amount: number | string | null;
  linha: string | null;
}): string | null {
  const digits = (input.linha ?? "").replace(/\D/g, "");
  const linha = digits.length >= 47 ? digits.slice(0, 47) : null;
  const orderKey = input.orderKey.trim();
  if (!linha || !orderKey) return null;
  const amount = paymentAmount(input.amount, linha);
  if (amount == null) return null;
  return `Pedido ${orderKey}\n\nValor: ${plainBrl(amount)}\n\n${linha}`;
}

function paymentAmount(amount: number | string | null, linha: string) {
  if (amount != null && amount !== "") {
    const number = typeof amount === "number" ? amount : Number(amount);
    if (Number.isFinite(number) && number >= 0) return Math.round(number * 100) / 100;
  }
  const cents = Number(linha.slice(-10));
  return Number.isFinite(cents) ? cents / 100 : null;
}

function plainBrl(value: number) {
  const [whole, cents] = value.toFixed(2).split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

export function taxQueueStatus(order: {
  tax_identified_at: string | null;
  import_tax: string | number | null;
  tax_paid: boolean;
}): TaxQueueStatus | null {
  if (!order.tax_identified_at) return null;
  if (order.tax_paid) return "paga";
  return order.import_tax == null ? "sem_valor" : "a_pagar";
}
