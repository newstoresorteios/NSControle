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
