export type Recipient = {
  name: string; address: string; number: string; complement: string;
  city: string; state: string; postal_code: string; country: string; phone: string; tax_id: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function pick(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return '';
}
export function trayRecipient(payload: Record<string, unknown>): Recipient {
  const address = record(payload.address);
  const customer = record(payload.customer);
  return {
    name: pick(address, 'recipient', 'name') || pick(customer, 'name'),
    address: pick(address, 'address', 'street'), number: pick(address, 'number', 'house_number'),
    complement: pick(address, 'complement', 'address_2'), city: pick(address, 'city'),
    state: pick(address, 'state'), postal_code: pick(address, 'zip_code', 'zipcode', 'postal_code', 'cep'),
    country: pick(address, 'country', 'country_code') || 'BR',
    phone: pick(customer, 'cellphone', 'phone'), tax_id: pick(customer, 'cpf', 'cnpj'),
  };
}
export function recipientValid(value: Recipient): boolean {
  return ['name','address','number','city','state','postal_code','country','phone','tax_id']
    .every(key => Boolean(value[key as keyof Recipient]?.trim()));
}
export function eligibleOrder(order: { delivered: boolean; commercial_status: string | null; tracking_code: string | null }) {
  const status = (order.commercial_status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  return !order.delivered && !order.tracking_code && ['A ENVIAR', 'A ENVIAR VINDI'].includes(status);
}
export function transitionAllowed(from: string, to: string) {
  return ({ pendente: ['preparando','cancelado'], preparando: ['embalado','cancelado'], embalado: ['enviado','cancelado'] } as Record<string,string[]>)[from]?.includes(to) ?? false;
}

// Keep in sync with apps/integracao/src/lib/integracao.ts. The Europa app deploys alone.
export const ANA_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "BRL"] as const;
export const ANA_PURCHASE_FIELDS = [
  "purchased",
  "supplier_name",
  "supplier_ref",
  "supplier_purchase_date",
  "purchase_currency",
  "purchase_foreign_amount",
  "payment_date",
] as const;

export function anaPurchaseVisible(order: { requested: boolean }) {
  return order.requested;
}

export type AnaPurchasePatch = {
  purchased: boolean;
  supplier_name: string | null;
  supplier_ref: string | null;
  supplier_purchase_date: string | null;
  purchase_currency: string | null;
  purchase_foreign_amount: number | null;
  payment_date: string | null;
};

export function anaPurchasePatch(input: {
  purchased: boolean;
  supplierName: string | null;
  supplierRef: string | null;
  supplierPurchaseDate: string | null;
  currency: string | null;
  foreignAmount: number | null;
  paymentDate: string | null;
}): { ok: true; patch: AnaPurchasePatch } | { ok: false } {
  const currency = input.currency ? input.currency.trim().toUpperCase() : null;
  if (currency && !ANA_CURRENCIES.includes(currency as (typeof ANA_CURRENCIES)[number])) return { ok: false };
  const amount = moneyAmount(input.foreignAmount);
  if (amount === false) return { ok: false };
  if (amount != null && !currency) return { ok: false };
  const supplierPurchaseDate = input.supplierPurchaseDate?.trim() || null;
  const paymentDate = input.paymentDate?.trim() || null;
  if ((supplierPurchaseDate && !calendarDate(supplierPurchaseDate)) || (paymentDate && !calendarDate(paymentDate))) {
    return { ok: false };
  }
  const patch: AnaPurchasePatch = {
    purchased: input.purchased,
    supplier_name: clip(input.supplierName, 200),
    supplier_ref: clip(input.supplierRef, 200),
    supplier_purchase_date: supplierPurchaseDate,
    purchase_currency: currency,
    purchase_foreign_amount: amount,
    payment_date: paymentDate,
  };
  const keys = Object.keys(patch).sort();
  const allowed = [...ANA_PURCHASE_FIELDS].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) return { ok: false };
  return { ok: true, patch };
}

export function pdfInvoice(bytes: Uint8Array, size: number) {
  return size > 0 && size <= 8 * 1024 * 1024 && bytes.byteLength >= 5 && bytes.byteLength === size
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function clip(value: string | null, max: number) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, max) : null;
}

function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function moneyAmount(value: number | null) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999.99) return false as const;
  const rounded = Math.round(value * 100) / 100;
  return Math.abs(rounded - value) > 0.001 ? false as const : rounded;
}
