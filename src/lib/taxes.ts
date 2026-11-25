export type TaxQueueStatus = "sem_valor" | "a_pagar" | "paga";

export const CUSTOMS_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  awaiting_payment: "Aguardando pagamento",
  boleto_pending: "Boleto a emitir",
  boleto_generated: "Boleto gerado",
  paid: "Paga",
  overdue: "Vencida",
  not_found: "Não encontrada",
  no_action: "Sem ação",
  error: "Erro",
};

const CUSTOMS_FILTERS: Record<string, string[] | null> = {
  "": null,
  abertas: ["pending", "awaiting_payment", "boleto_pending", "overdue"],
  boleto: ["boleto_generated"],
  pagas: ["paid"],
  falhas: ["not_found", "no_action", "error"],
};

export function customsStatusLabel(status: string) {
  return CUSTOMS_STATUS_LABEL[status] ?? status;
}

export function customsFilterStatuses(filter: string) {
  return Object.prototype.hasOwnProperty.call(CUSTOMS_FILTERS, filter) ? CUSTOMS_FILTERS[filter] : null;
}

export function customsPayText(input: {
  orderKey: string;
  amount: number | string | null;
  linha: string | null;
}): string | null {
  const ready = taxPaymentText(input);
  if (ready) return ready;
  const orderKey = input.orderKey.trim();
  if (!orderKey || input.amount == null || input.amount === "") return null;
  const number = typeof input.amount === "number" ? input.amount : Number(input.amount);
  if (!Number.isFinite(number) || number < 0) return null;
  const [whole, cents] = (Math.round(number * 100) / 100).toFixed(2).split(".");
  return `Pedido ${orderKey}\n\nValor: R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

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
