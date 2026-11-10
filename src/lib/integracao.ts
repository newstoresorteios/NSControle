export type Recipient = {
  name: string; address: string; number: string; complement: string;
  city: string; state: string; postal_code: string; country: string; phone: string; tax_id: string;
  email: string; neighborhood: string;
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
    email: pick(customer, 'email'), neighborhood: pick(address, 'neighborhood', 'district', 'bairro'),
  };
}
export type CustomerCard = {
  name: string;
  taxId: string;
  email: string;
  phone: string;
  street: string;
  neighborhood: string;
  city: string;
  postalCode: string;
};

export function formatDocument(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value.trim();
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return digits.replace(/(\d{5})(\d{3})/, "$1-$2");
  return value.trim();
}

export function customerCard(recipient: Partial<Recipient> | null | undefined): CustomerCard | null {
  if (!recipient) return null;
  const street = [recipient.address, recipient.number].map((part) => part?.trim()).filter(Boolean).join(", ");
  const streetLine = [street, recipient.complement?.trim()].filter(Boolean).join(" · ");
  const city = [recipient.city, recipient.state].map((part) => part?.trim()).filter(Boolean).join("/");
  const card: CustomerCard = {
    name: recipient.name?.trim() ?? "",
    taxId: formatDocument(recipient.tax_id ?? ""),
    email: recipient.email?.trim() ?? "",
    phone: recipient.phone?.trim() ?? "",
    street: streetLine,
    neighborhood: recipient.neighborhood?.trim() ?? "",
    city,
    postalCode: formatCep(recipient.postal_code ?? ""),
  };
  return Object.values(card).some(Boolean) ? card : null;
}

function addressRank(row: Record<string, unknown>) {
  const type = String(row.type ?? "").trim().toLowerCase();
  if (type === "1" || type === "delivery" || type === "entrega") return 2;
  if (type === "0" || type === "billing" || type === "cobranca" || type === "cobrança") return 0;
  return 1;
}

export function trayOrderRef(orderKey: string, hint = ""): { store: string; id: string; customerId: string } | null {
  const key = orderKey.trim();
  const hinted = /\b(\d{6,}):(\d+)\b/.exec(hint);
  const prefixed = /^(\d{6,}):(\d+)$/.exec(key);
  if (prefixed) {
    const customerId = hinted && hinted[1] === prefixed[1] ? hinted[2] : "";
    return { store: prefixed[1], id: prefixed[2], customerId };
  }
  if (!/^\d+$/.test(key)) return null;
  if (!hinted || hinted[1] === key) return { store: "", id: key, customerId: "" };
  return { store: hinted[1], id: key, customerId: hinted[2] };
}

export function chooseDeliveryAddress(payload: unknown): Partial<Recipient> | null {
  const root = record(payload);
  const list = Array.isArray(root.addresses) ? root.addresses : [];
  const chosen = list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .sort((a, b) => addressRank(b) - addressRank(a))
    .find((row) => pick(row, "address", "street"));
  if (!chosen) return null;
  return {
    name: pick(chosen, "recipient", "name"),
    address: pick(chosen, "address", "street"),
    number: pick(chosen, "number", "house_number"),
    complement: pick(chosen, "complement", "address_2"),
    neighborhood: pick(chosen, "neighborhood", "district", "bairro"),
    city: pick(chosen, "city"),
    state: pick(chosen, "state"),
    postal_code: pick(chosen, "zip_code", "zipcode", "postal_code", "cep"),
    country: pick(chosen, "country", "country_code") || "BR",
    phone: pick(chosen, "cellphone", "phone"),
    tax_id: "",
    email: "",
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
