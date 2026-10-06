import { db, insertRow, updateRow } from "@/lib/db";
import { applyBiDraft, draftFromBi, type BiOrder, type BiShipment } from "@/lib/bi-map";
import type { StoredOrder } from "@/lib/tray-map";

const LOOKBACK_DAYS = 180;
const ORDER_COLUMNS =
  "id, order_key, flow, finance_month, label, origin, product_name, reference, commercial_status, sale_amount, payment_date, purchase_date, tracking_code, delivered, data_source, tray_modified_at";

export type BiSyncReport = {
  ok: boolean;
  reason: string;
  listed: number;
  upserted: number;
  skipped: number;
};

function biUrl() {
  return (process.env.BI_API_URL || "https://ns-bi-backend.onrender.com").replace(/\/$/, "");
}

async function biGet(path: string): Promise<unknown> {
  const response = await fetch(new URL(path, `${biUrl()}/`), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) throw new Error(`bi_${response.status}`);
  return response.json();
}

function shipmentMap(payload: unknown) {
  const items = payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
    ? ((payload as { items: BiShipment[] }).items)
    : [];
  const map = new Map<string, BiShipment>();
  for (const item of items) {
    const number = String(item.number ?? "").trim();
    if (number) map.set(number, item);
  }
  return map;
}

export async function runBiSync(): Promise<BiSyncReport> {
  const empty = { ok: false, reason: "erro", listed: 0, upserted: 0, skipped: 0 };
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
    const [ordersPayload, logisticsPayload] = await Promise.all([
      biGet(`/api/v1/orders?limit=2000&days=${LOOKBACK_DAYS}`),
      biGet(`/api/v1/analytics/logistics?page=1&pageSize=100&dateFrom=${since}&period=365d`),
    ]);
    const orders = Array.isArray(ordersPayload) ? (ordersPayload as BiOrder[]) : [];
    const shipments = shipmentMap(logisticsPayload);
    const existingRows = await db()<StoredOrder[]>`
      select ${db().unsafe(ORDER_COLUMNS)}
      from ctl_orders
      where flow = 'loja_nova'
    `;
    const existing = new Map<string, StoredOrder>();
    for (const row of existingRows) {
      const current = existing.get(row.order_key);
      if (!current || String(row.finance_month || "") > String(current.finance_month || "")) {
        existing.set(row.order_key, row);
      }
    }

    let upserted = 0;
    let skipped = 0;
    for (const order of orders) {
      const number = String(order.number ?? order.id ?? "").trim();
      const draft = draftFromBi(order, shipments.get(number));
      if (!draft) {
        skipped += 1;
        continue;
      }
      const current = existing.get(draft.order_key) ?? null;
      const merged = applyBiDraft(current, draft);
      if (current && !changed(current, merged.row)) {
        skipped += 1;
        continue;
      }
      if (!current || merged.mode === "insert") {
        const created = await insertRow("ctl_orders", merged.row);
        existing.set(draft.order_key, { ...current, id: String(created.id), order_key: draft.order_key } as StoredOrder);
      } else {
        await updateRow("ctl_orders", merged.row, "id", current.id);
      }
      upserted += 1;
    }
    await db()`
      insert into ctl_tray_sync (id, last_run_at, last_status, last_error, last_report)
      values ('bi', now(), 'ok', null, ${db().json({ listed: orders.length, upserted, skipped })})
      on conflict (id) do update set
        last_run_at = now(),
        last_status = 'ok',
        last_error = null,
        last_report = excluded.last_report
    `;
    return { ok: true, reason: "ok", listed: orders.length, upserted, skipped };
  } catch (error) {
    console.error("bi sync", error instanceof Error ? error.message : "erro");
    return empty;
  }
}

function changed(existing: StoredOrder, row: Record<string, unknown>) {
  for (const key of ["sale_amount", "commercial_status", "tracking_code", "delivered", "payment_date", "product_name"] as const) {
    if (!(key in row)) continue;
    const next = row[key];
    const previous = existing[key];
    if (next == null && (previous == null || previous === "")) continue;
    if (String(previous ?? "") !== String(next ?? "")) return true;
  }
  return !existing.label;
}
