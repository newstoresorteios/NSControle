export type TaxQueueStatus = "sem_valor" | "a_pagar" | "paga";

export function taxQueueStatus(order: {
  tax_identified_at: string | null;
  import_tax: string | number | null;
  tax_paid: boolean;
}): TaxQueueStatus | null {
  if (!order.tax_identified_at) return null;
  if (order.tax_paid) return "paga";
  return order.import_tax == null ? "sem_valor" : "a_pagar";
}
