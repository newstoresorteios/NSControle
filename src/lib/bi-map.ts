import { buildTrayDraft, dateOnly, mergeTrayOrder, monthStart, type StoredOrder, type TrayDraft } from "./tray-map.ts";

export type BiOrder = {
  id?: unknown;
  number?: unknown;
  customerName?: unknown;
  status?: unknown;
  date?: unknown;
  total?: unknown;
};

export type BiShipment = {
  id?: unknown;
  number?: unknown;
  shipmentStatus?: unknown;
  shippingMethod?: unknown;
  shippingCost?: unknown;
  trackingCode?: unknown;
  shippedAt?: unknown;
  deliveredAt?: unknown;
  city?: unknown;
  state?: unknown;
};

const CANCELLED = new Set(["0", "5", "cancelled", "cancelado"]);
const QUOTES = new Set(["1", "orcamento", "orçamento", "budget", "quote"]);
const SALES = new Set(["2", "pedido", "order"]);

function text(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed && trimmed !== "—" ? trimmed : null;
}

function statusKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function biOrderKey(order: BiOrder): string | null {
  const id = text(order.id);
  const number = text(order.number);
  if (id && /^(\d+):(\d+)$/.test(id)) return id;
  const key = number || id;
  if (!key || !/^\d+$/.test(key)) return null;
  return key;
}

export function draftFromBi(order: BiOrder, shipment?: BiShipment): TrayDraft | null {
  const qualified = biOrderKey(order);
  const key = qualified?.includes(":") ? qualified.split(":")[1] : qualified;
  if (!key) return null;
  const status = statusKey(order.status);
  if (QUOTES.has(status)) return null;

  const base = buildTrayDraft({
    order: {
      id: key,
      status: CANCELLED.has(status) ? "CANCELADO" : "A ENVIAR",
      status_group: CANCELLED.has(status) ? "cancelled" : SALES.has(status) ? "awaiting_shipment" : undefined,
      total: order.total,
      date: order.date,
      has_payment: SALES.has(status),
      payment_date: SALES.has(status) ? order.date : null,
    },
    payment: {
      has_payment: SALES.has(status),
      payment_date: SALES.has(status) ? order.date : null,
    },
    customer: { name: text(order.customerName) },
    shipping: {
      shipment: text(shipment?.shippingMethod),
      shipment_value: shipment?.shippingCost,
      sending_code: text(shipment?.trackingCode),
      sending_date: shipment?.deliveredAt || shipment?.shippedAt || null,
    },
    address: {
      city: text(shipment?.city),
      state: text(shipment?.state),
    },
  });
  if (!base) return null;
  if (shipment?.shipmentStatus === "delivered" || shipment?.deliveredAt) {
    base.delivered = true;
    base.commercial_status = "FINALIZADO";
  } else if (shipment?.shipmentStatus === "shipped" || shipment?.shippedAt) {
    base.commercial_status = "ENVIADO";
    base.delivered = false;
  } else if (!CANCELLED.has(status)) {
    base.commercial_status = null;
  }
  const issued = dateOnly(order.date);
  base.finance_month = monthStart(issued);
  if (qualified?.includes(":")) {
    const [store, number] = qualified.split(":");
    base.order_key = qualified;
    base.label = `Pedido ${number} · ${store}`;
  }
  base.notes_tray = ["BI", qualified?.includes(":") ? qualified.split(":")[0] : null, text(order.customerName), text(shipment?.city), text(shipment?.shippingMethod)]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 4000);
  return base;
}

export function applyBiDraft(existing: StoredOrder | null, draft: TrayDraft) {
  const merged = mergeTrayOrder(existing, draft);
  if (!existing || (existing.data_source !== "planilha" && existing.data_source !== "manual")) {
    merged.row.data_source = "bi";
  }
  if (existing?.commercial_status && draft.commercial_status == null) {
    delete merged.row.commercial_status;
  }
  return merged;
}
