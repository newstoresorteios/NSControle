export const LOOKBACK_DAYS = 120;

const STATUS_GROUPS: Record<string, string> = {
  "AGUARDANDO PAGAMENTO": "awaiting_payment",
  "AGUARDANDO VINDI": "awaiting_payment",
  "A ENVIAR": "awaiting_shipment",
  "A ENVIAR VINDI": "awaiting_shipment",
  ENVIADO: "shipped",
  FINALIZADO: "completed",
  CANCELADO: "cancelled",
};

const SENTINEL = "0001-01-01";

export type TrayComplete = {
  order?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  address?: Record<string, unknown>;
  products?: Array<Record<string, unknown>>;
};

export type StoredOrder = {
  id: string;
  order_key: string;
  flow: string;
  finance_month: string | null;
  label: string | null;
  origin: string | null;
  product_name: string | null;
  reference: string | null;
  commercial_status: string | null;
  sale_amount: number | string | null;
  payment_date: string | null;
  purchase_date: string | null;
  tracking_code: string | null;
  delivered: boolean;
  data_source: string | null;
  tray_modified_at: string | null;
};

export type TrayDraft = {
  order_key: string;
  label: string;
  flow: "loja_nova";
  origin: "Loja";
  product_name: string | null;
  reference: string | null;
  commercial_status: string | null;
  sale_amount: number | null;
  sale_explicit: boolean;
  payment_date: string | null;
  purchase_date: string | null;
  finance_month: string | null;
  tracking_code: string | null;
  tracking_event_at: string | null;
  delivered: boolean;
  cancelled: boolean;
  cancel_amount: number | null;
  payment_method: string | null;
  notes_tray: string;
  tray_modified_at: string | null;
};

export function orderKey(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return /^\d+$/.test(text) ? text : null;
}

export function money(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  }
  if (value == null) return null;
  let text = String(value).trim().replace(/\s/g, "").replace("R$", "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || match[1].startsWith("0000")) return null;
  return match[1];
}

export function monthStart(day: string | null): string | null {
  return day ? `${day.slice(0, 7)}-01` : null;
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function saoPauloToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function trayTime(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.startsWith("0000")) return null;
  let normalized = text.includes("T") ? text : text.replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += "Z";
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? null : time;
}

export function trayTimeIso(value: unknown): string | null {
  const time = trayTime(value);
  return time == null ? null : new Date(time).toISOString();
}

export function isSameTrayVersion(stored: string | null, modified: unknown): boolean {
  const previous = trayTime(stored);
  const next = trayTime(modified);
  if (previous == null || next == null) return false;
  return previous >= next;
}

export function normalizeStatus(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text ? text.toUpperCase() : null;
}

export function statusGroupOf(status: string | null, provided?: unknown): string | null {
  if (typeof provided === "string" && provided.trim()) return provided.trim();
  if (!status) return null;
  return STATUS_GROUPS[status] ?? null;
}

export function orderListFilters(input: {
  backfillDone: boolean;
  watermark: string | null;
  today: string;
}): Record<string, string> {
  if (input.backfillDone && input.watermark) {
    return { lastModifiedStart: input.watermark };
  }
  return { date: `${addIsoDays(input.today, -LOOKBACK_DAYS)},${input.today}` };
}

export function orderIdFromEvent(event: { scope_name?: unknown; scope_id?: unknown }): string | null {
  const scope = String(event.scope_name ?? "").toLowerCase();
  if (!scope.includes("order")) return null;
  return orderKey(event.scope_id);
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function productLines(products: Array<Record<string, unknown>> | undefined): string[] {
  if (!Array.isArray(products)) return [];
  return products
    .map((product) => {
      const name = text(product.name) || text(product.reference);
      if (!name) return null;
      const quantity = Number(product.quantity);
      return Number.isInteger(quantity) && quantity > 1 ? `${quantity}x ${name}` : name;
    })
    .filter((line): line is string => Boolean(line));
}

function countSale(hasPayment: boolean | null, group: string | null): boolean {
  if (group === "cancelled") return false;
  if (hasPayment === true) return true;
  if (hasPayment === false) return false;
  return group != null && group !== "awaiting_payment";
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

export function buildTrayDraft(complete: TrayComplete): TrayDraft | null {
  const order = complete.order ?? {};
  const key = orderKey(order.id);
  if (!key) return null;
  const payment = complete.payment ?? {};
  const shipping = complete.shipping ?? {};
  const customer = complete.customer ?? {};
  const address = complete.address ?? {};
  const status = normalizeStatus(order.status);
  const group = statusGroupOf(status, order.status_group);
  const hasPayment = asBool(payment.has_payment) ?? asBool(order.has_payment);
  const paid = countSale(hasPayment, group);
  const total = money(order.total);
  const paymentDay = dateOnly(payment.payment_date) || dateOnly(order.payment_date);
  const orderDay = dateOnly(order.date) || dateOnly(order.created);
  const lines = productLines(complete.products);
  const shipmentValue = money(shipping.shipment_value);
  const discount = money(order.discount);
  const taxes = money(order.taxes);
  const paymentMethod = text(payment.method) || text(order.payment_method);
  const customerName = text(customer.name);
  const phone = text(customer.phone) || text(customer.cellphone);
  const city = text(address.city);
  const state = text(address.state);
  const shipment = text(shipping.shipment);
  const place = city && state ? `${city}/${state}` : city;
  const head = [
    "Tray",
    paymentMethod,
    customerName,
    phone,
    place,
    shipment && shipmentValue != null ? `${shipment} frete ${shipmentValue.toFixed(2)}` : shipment,
    discount ? `desconto ${discount.toFixed(2)}` : null,
    taxes ? `impostos ${taxes.toFixed(2)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const sending = text(shipping.sending_date);
  const sendingDay = dateOnly(sending);
  const trackingEvent = sending && sending.trim().length > 10 ? trayTimeIso(sending) : sendingDay ? `${sendingDay}T15:00:00.000Z` : null;

  return {
    order_key: key,
    label: `Pedido ${key}`,
    flow: "loja_nova",
    origin: "Loja",
    product_name: lines[0]?.slice(0, 300) ?? null,
    reference: lines.join(" / ").slice(0, 500) || null,
    commercial_status: status,
    sale_amount: paid ? total : null,
    sale_explicit: paid ? total != null : group === "cancelled" || group === "awaiting_payment" || hasPayment === false,
    payment_date: paid ? paymentDay : null,
    purchase_date: orderDay,
    finance_month: monthStart((paid && paymentDay) || orderDay),
    tracking_code: text(shipping.sending_code),
    tracking_event_at: trackingEvent,
    delivered: group === "completed",
    cancelled: group === "cancelled",
    cancel_amount: total,
    payment_method: paymentMethod,
    notes_tray: [head, lines.join("; ")].filter(Boolean).join("\n").slice(0, 4000),
    tray_modified_at: trayTimeIso(order.modified),
  };
}

export function cancellationFromTray(draft: TrayDraft, orderId: string | null) {
  if (!draft.cancelled) return null;
  return {
    order_id: orderId,
    order_key: draft.order_key,
    model: draft.product_name,
    amount: draft.cancel_amount,
    status: "Cancelado",
    gateway: draft.payment_method || "Tray",
    refund_method: draft.payment_method,
    reason: "Cancelado na Tray",
  };
}

function monthKey(month: string | null): string {
  return month || SENTINEL;
}

export function mergeTrayOrder(
  existing: StoredOrder | null,
  draft: TrayDraft,
): { mode: "insert" | "update"; row: Record<string, unknown> } {
  if (!existing) {
    return {
      mode: "insert",
      row: {
        order_key: draft.order_key,
        label: draft.label,
        flow: draft.flow,
        origin: draft.origin,
        reference: draft.reference,
        product_name: draft.product_name,
        commercial_status: draft.commercial_status,
        purchased: false,
        cpf_linked: false,
        tax_paid: false,
        delivered: draft.delivered,
        tracking_code: draft.tracking_code,
        tracking_event_at: draft.tracking_event_at,
        purchase_date: draft.purchase_date,
        payment_date: draft.payment_date,
        sale_amount: draft.sale_explicit ? draft.sale_amount : null,
        finance_month: draft.finance_month,
        finance_month_key: monthKey(draft.finance_month),
        data_source: "tray",
        tray_modified_at: draft.tray_modified_at,
        notes_tray: draft.notes_tray,
      },
    };
  }

  const row: Record<string, unknown> = {
    data_source: "tray",
    notes_tray: draft.notes_tray,
    tray_modified_at: draft.tray_modified_at,
  };
  const label = (existing.label || "").trim();
  if (!label || label === existing.order_key) row.label = draft.label;
  if (!existing.origin) row.origin = draft.origin;
  if (draft.product_name) row.product_name = draft.product_name;
  if (draft.reference) row.reference = draft.reference;
  if (draft.commercial_status) row.commercial_status = draft.commercial_status;
  if (draft.sale_explicit) row.sale_amount = draft.sale_amount;
  if (draft.payment_date) row.payment_date = draft.payment_date;
  if (!existing.purchase_date && draft.purchase_date) row.purchase_date = draft.purchase_date;
  if (draft.tracking_code) row.tracking_code = draft.tracking_code;
  if (draft.tracking_event_at) row.tracking_event_at = draft.tracking_event_at;
  if (draft.delivered) row.delivered = true;
  else if (draft.cancelled) row.delivered = false;
  const keepMonth = existing.finance_month && existing.data_source !== "tray";
  if (!keepMonth && draft.finance_month && existing.finance_month !== draft.finance_month) {
    row.finance_month = draft.finance_month;
    row.finance_month_key = monthKey(draft.finance_month);
  } else if (!existing.finance_month && draft.finance_month) {
    row.finance_month = draft.finance_month;
    row.finance_month_key = monthKey(draft.finance_month);
  }
  return { mode: "update", row };
}
