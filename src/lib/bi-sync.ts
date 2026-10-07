import { revalidatePath } from "next/cache";
import { db, insertRow, updateRow } from "@/lib/db";
import { applyBiDraft, draftFromBi, type BiOrder, type BiShipment } from "@/lib/bi-map";
import type { StoredOrder } from "@/lib/tray-map";

const FULL_LOOKBACK_DAYS = 180;
const RECENT_LOOKBACK_DAYS = 10;
const RECENT_COOLDOWN_MS = 25_000;
const NUDGE_COOLDOWN_MS = 2 * 60 * 1000;
const ORDER_COLUMNS =
  "id, order_key, flow, finance_month, label, origin, product_name, reference, commercial_status, sale_amount, payment_date, purchase_date, tracking_code, delivered, data_source, tray_modified_at, shipping_cost";

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

async function lastRun(id: string) {
  const rows = await db()<{ last_run_at: string | null }[]>`
    select last_run_at from ctl_tray_sync where id = ${id} limit 1
  `;
  const value = rows[0]?.last_run_at;
  return value ? new Date(value).getTime() : 0;
}

async function nudgeBiOrders() {
  const previous = await lastRun("bi-nudge");
  if (previous && Date.now() - previous < NUDGE_COOLDOWN_MS) return;
  await db()`
    insert into ctl_tray_sync (id, last_run_at, last_status)
    values ('bi-nudge', now(), 'ok')
    on conflict (id) do update set last_run_at = now(), last_status = 'ok'
  `;
  await fetch(new URL("/api/v1/sync/orders", `${biUrl()}/`), {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}

export async function runBiSync(options?: { recent?: boolean }): Promise<BiSyncReport> {
  const recent = options?.recent !== false;
  const empty = { ok: false, reason: "erro", listed: 0, upserted: 0, skipped: 0 };
  try {
    if (recent) {
      const previous = await lastRun("bi");
      if (previous && Date.now() - previous < RECENT_COOLDOWN_MS) {
        return { ok: true, reason: "ok", listed: 0, upserted: 0, skipped: 0 };
      }
    }
    await nudgeBiOrders();
    const days = recent ? RECENT_LOOKBACK_DAYS : FULL_LOOKBACK_DAYS;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const [ordersPayload, logisticsPayload] = await Promise.all([
      biGet(`/api/v1/orders?limit=${recent ? 200 : 2000}&days=${days}`),
      biGet(`/api/v1/analytics/logistics?page=1&pageSize=100&dateFrom=${since}&period=365d`),
    ]);
    const orders = Array.isArray(ordersPayload) ? (ordersPayload as BiOrder[]) : [];
    const shipments = shipmentMap(logisticsPayload);
    const keys = orders
      .map((order) => String(order.number ?? order.id ?? "").trim())
      .filter((key) => /^\d+$/.test(key));
    const existingRows = keys.length
      ? await db()<StoredOrder[]>`
          select ${db().unsafe(ORDER_COLUMNS)}
          from ctl_orders
          where order_key in ${db()(keys)}
          order by order_key,
            case flow when 'encomenda' then 0 when 'loja_nova' then 1 else 2 end,
            finance_month desc nulls last
        `
      : [];
    const existing = new Map<string, StoredOrder>();
    for (const row of existingRows) {
      if (!existing.has(row.order_key)) existing.set(row.order_key, row);
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

export async function scheduleBiSync() {
  try {
    const report = await runBiSync({ recent: true });
    if (report.upserted > 0) {
      revalidatePath("/");
      revalidatePath("/pedidos");
      revalidatePath("/financeiro");
      revalidatePath("/cancelamentos");
      return true;
    }
    return false;
  } catch (error) {
    console.error("bi sync", error instanceof Error ? error.message : "erro");
    return false;
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
