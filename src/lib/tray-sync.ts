import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TrayRequestError, trayConfigured, trayGet } from "@/lib/tray-client";
import {
  addIsoDays,
  buildTrayDraft,
  cancellationFromTray,
  isSameTrayVersion,
  mergeTrayOrder,
  orderIdFromEvent,
  orderKey,
  orderListFilters,
  saoPauloToday,
  trayTimeIso,
  type StoredOrder,
  type TrayComplete,
  type TrayDraft,
} from "@/lib/tray-map";

const BATCH = 15;
const MAX_LIST_PAGES = 4;
const INTERVAL_MS = 8 * 60 * 1000;
const LOCK_MS = 90 * 1000;
const ORDER_COLUMNS =
  "id, order_key, flow, finance_month, label, origin, product_name, reference, commercial_status, sale_amount, payment_date, purchase_date, tracking_code, delivered, data_source, tray_modified_at";

type SyncDb = SupabaseClient;

export type SyncReport = {
  ok: boolean;
  reason: string;
  listed: number;
  fetched: number;
  upserted: number;
  skipped: number;
  cancellations: number;
  failures: number;
};

type SyncState = {
  cursor_page: number;
  watermark: string | null;
  backfill_done: boolean;
  last_event_id: number;
  last_run_at: string | null;
  last_status: string | null;
};

type Progress = {
  page: number;
  eventCursor: number;
  backfillDone: boolean;
  watermark: string | null;
  listed: number;
  fetched: number;
  upserted: number;
  skipped: number;
  cancellations: number;
  failures: number;
};

function empty(reason: string, ok: boolean): SyncReport {
  return { ok, reason, listed: 0, fetched: 0, upserted: 0, skipped: 0, cancellations: 0, failures: 0 };
}

function reportFrom(progress: Progress, reason: string, ok: boolean): SyncReport {
  return {
    ok,
    reason,
    listed: progress.listed,
    fetched: progress.fetched,
    upserted: progress.upserted,
    skipped: progress.skipped,
    cancellations: progress.cancellations,
    failures: progress.failures,
  };
}

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

function isLimit(error: unknown): boolean {
  return error instanceof TrayRequestError && error.status === 429;
}

async function readState(db: SyncDb): Promise<SyncState> {
  const { data, error } = await db.from("ctl_tray_sync").select("*").eq("id", "orders").maybeSingle();
  if (error) throw new TrayRequestError("sync_state", 500);
  return {
    cursor_page: Number(data?.cursor_page) || 1,
    watermark: data?.watermark ? String(data.watermark).slice(0, 10) : null,
    backfill_done: data?.backfill_done === true,
    last_event_id: Number(data?.last_event_id) || 0,
    last_run_at: data?.last_run_at ? String(data.last_run_at) : null,
    last_status: data?.last_status ? String(data.last_status) : null,
  };
}

async function claim(db: SyncDb, force: boolean): Promise<SyncState | null> {
  const state = await readState(db);
  const last = state.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  const age = Number.isNaN(last) ? INTERVAL_MS : Date.now() - last;
  if (state.last_status === "running" && age < LOCK_MS) return null;
  if (!force && state.last_status === "ok" && age < INTERVAL_MS) return null;
  if (!force && state.last_status === "limite" && age < 2 * 60 * 1000) return null;
  const { error } = await db.from("ctl_tray_sync").upsert({
    id: "orders",
    last_status: "running",
    last_run_at: new Date().toISOString(),
    last_error: null,
  });
  if (error) throw new TrayRequestError("sync_claim", 500);
  return state;
}

async function finish(db: SyncDb, status: string, error: string | null, progress: Progress) {
  await db
    .from("ctl_tray_sync")
    .update({
      cursor_page: progress.page,
      watermark: progress.watermark,
      backfill_done: progress.backfillDone,
      last_event_id: progress.eventCursor,
      last_run_at: new Date().toISOString(),
      last_status: status,
      last_error: error,
      last_report: {
        listed: progress.listed,
        fetched: progress.fetched,
        upserted: progress.upserted,
        skipped: progress.skipped,
        cancellations: progress.cancellations,
        failures: progress.failures,
      },
    })
    .eq("id", "orders");
}

async function listPage(
  page: number,
  filters: Record<string, string>,
  sort: { enabled: boolean },
): Promise<Array<Record<string, unknown>>> {
  const params: Record<string, string> = { ...filters, page: String(page), limit: "50" };
  if (sort.enabled) params.sort = "id_desc";
  try {
    const body = await trayGet("/internal/orders", params);
    return Array.isArray(body.orders) ? (body.orders as Array<Record<string, unknown>>) : [];
  } catch (error) {
    if (sort.enabled && error instanceof TrayRequestError && (error.status === 400 || error.status === 422)) {
      sort.enabled = false;
      return listPage(page, filters, sort);
    }
    throw error;
  }
}

async function findLoja(db: SyncDb, key: string): Promise<StoredOrder | null> {
  const { data, error } = await db
    .from("ctl_orders")
    .select(ORDER_COLUMNS)
    .eq("order_key", key)
    .eq("flow", "loja_nova")
    .order("finance_month", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new TrayRequestError("order_lookup", 500);
  return ((data ?? [])[0] as StoredOrder | undefined) ?? null;
}

async function writeOrder(db: SyncDb, existing: StoredOrder | null, draft: TrayDraft): Promise<string | null> {
  const merged = mergeTrayOrder(existing, draft);
  if (!existing || merged.mode === "insert") {
    const inserted = await db.from("ctl_orders").insert(merged.row).select("id").single();
    if (!inserted.error && inserted.data?.id) return String(inserted.data.id);
    if (inserted.error?.code !== "23505") throw new TrayRequestError("order_insert", 500);
    const again = await findLoja(db, draft.order_key);
    if (!again) throw new TrayRequestError("order_insert", 500);
    return updateOrder(db, again.id, mergeTrayOrder(again, draft).row);
  }
  try {
    return await updateOrder(db, existing.id, merged.row);
  } catch (error) {
    if (!(error instanceof TrayRequestError) || error.code !== "order_conflict") throw error;
    const rest = { ...merged.row };
    delete rest.finance_month;
    delete rest.finance_month_key;
    return updateOrder(db, existing.id, rest);
  }
}

async function updateOrder(db: SyncDb, id: string, row: Record<string, unknown>): Promise<string> {
  const updated = await db.from("ctl_orders").update(row).eq("id", id).select("id").single();
  if (updated.error?.code === "23505") throw new TrayRequestError("order_conflict", 409);
  if (updated.error || !updated.data?.id) throw new TrayRequestError("order_update", 500);
  return String(updated.data.id);
}

async function writeCancellation(db: SyncDb, draft: TrayDraft, orderId: string | null) {
  const cancel = cancellationFromTray(draft, orderId);
  if (!cancel) return false;
  const { data, error } = await db.from("ctl_cancellations").select("id").eq("order_key", draft.order_key).limit(1);
  if (error || (data ?? []).length > 0) return false;
  const created = await db.from("ctl_cancellations").insert(cancel);
  return !created.error;
}

async function pullOne(db: SyncDb, key: string, listedModified: unknown) {
  const complete = await trayGet(`/internal/orders/${key}/complete`);
  const draft = buildTrayDraft(complete as TrayComplete);
  if (!draft) return { upserted: false, cancellation: false };
  if (!draft.tray_modified_at) draft.tray_modified_at = trayTimeIso(listedModified);
  const existing = await findLoja(db, key);
  const orderId = await writeOrder(db, existing, draft);
  const cancellation = await writeCancellation(db, draft, orderId);
  if (draft.tracking_code && orderId) {
    await db.from("ctl_inventory_items").update({ order_id: orderId }).eq("tracking_code", draft.tracking_code).is("order_id", null);
  }
  return { upserted: true, cancellation };
}

async function take(db: SyncDb, progress: Progress, seen: Set<string>, key: string, modified: unknown) {
  if (progress.fetched > 0) await pause();
  progress.fetched += 1;
  seen.add(key);
  try {
    const result = await pullOne(db, key, modified);
    if (result.upserted) progress.upserted += 1;
    if (result.cancellation) progress.cancellations += 1;
  } catch (error) {
    if (isLimit(error)) throw error;
    progress.failures += 1;
  }
}

async function execute(db: SyncDb, state: SyncState, progress: Progress, today: string) {
  const seen = new Set<string>();
  let events: Array<Record<string, unknown>> = [];
  try {
    const body = await trayGet("/internal/webhooks/events", {
      since_id: String(state.last_event_id || 0),
      limit: "50",
    });
    events = Array.isArray(body.events) ? (body.events as Array<Record<string, unknown>>) : [];
  } catch (error) {
    if (isLimit(error)) throw error;
  }

  for (const event of events) {
    if (progress.fetched >= BATCH) break;
    const id = Number(event.id);
    const key = orderIdFromEvent(event);
    if (!key) {
      if (Number.isFinite(id)) progress.eventCursor = Math.max(progress.eventCursor, id);
      continue;
    }
    await take(db, progress, seen, key, null);
    if (Number.isFinite(id)) progress.eventCursor = Math.max(progress.eventCursor, id);
  }

  const activeFilters = orderListFilters({
    backfillDone: state.backfill_done,
    watermark: state.watermark,
    today,
  });
  const sort = { enabled: true };
  let pages = 0;
  while (progress.fetched < BATCH && pages < MAX_LIST_PAGES) {
    let orders: Array<Record<string, unknown>>;
    try {
      orders = await listPage(progress.page, activeFilters, sort);
    } catch (error) {
      const rejected = error instanceof TrayRequestError && (error.status === 400 || error.status === 422);
      if (!rejected || Object.keys(activeFilters).length === 0) throw error;
      for (const key of Object.keys(activeFilters)) delete activeFilters[key];
      orders = await listPage(progress.page, activeFilters, sort);
    }
    pages += 1;
    progress.listed += orders.length;
    if (orders.length === 0) {
      progress.backfillDone = true;
      progress.page = 1;
      break;
    }
    let pendingLeft = false;
    for (const order of orders) {
      const key = orderKey(order.id);
      if (!key || seen.has(key)) continue;
      const { data } = await db
        .from("ctl_orders")
        .select("tray_modified_at")
        .eq("order_key", key)
        .eq("flow", "loja_nova")
        .limit(1);
      const stored = data?.[0]?.tray_modified_at ? String(data[0].tray_modified_at) : null;
      if (isSameTrayVersion(stored, order.modified)) {
        progress.skipped += 1;
        continue;
      }
      if (progress.fetched >= BATCH) {
        pendingLeft = true;
        break;
      }
      await take(db, progress, seen, key, order.modified);
    }
    if (orders.length < 50) {
      if (!pendingLeft) {
        progress.backfillDone = true;
        progress.page = 1;
      }
      break;
    }
    if (pendingLeft) break;
    progress.page += 1;
  }
}

export async function runTraySync(db: SyncDb, options?: { force?: boolean }): Promise<SyncReport> {
  if (!trayConfigured()) return empty("nao_configurado", false);

  let state: SyncState | null;
  try {
    state = await claim(db, options?.force === true);
  } catch (error) {
    console.error("tray sync", error instanceof Error ? error.message : "erro");
    return empty("erro", false);
  }
  if (!state) return empty("aguardando", true);

  const today = saoPauloToday();
  const progress: Progress = {
    page: state.cursor_page || 1,
    eventCursor: state.last_event_id || 0,
    backfillDone: state.backfill_done,
    watermark: state.watermark,
    listed: 0,
    fetched: 0,
    upserted: 0,
    skipped: 0,
    cancellations: 0,
    failures: 0,
  };

  try {
    await execute(db, state, progress, today);
    if (progress.backfillDone) progress.watermark = addIsoDays(today, -2);
    await finish(db, "ok", null, progress);
    return reportFrom(progress, "ok", true);
  } catch (error) {
    const limited = isLimit(error);
    if (!limited) console.error("tray sync", error instanceof Error ? error.message : "erro");
    await finish(db, limited ? "limite" : "erro", limited ? "limite" : "erro", progress).catch(() => undefined);
    return reportFrom(progress, limited ? "limite" : "erro", false);
  }
}

export async function scheduleTraySync(db: SyncDb) {
  if (!trayConfigured()) return;
  try {
    const report = await runTraySync(db, { force: false });
    if (report.upserted > 0) {
      revalidatePath("/");
      revalidatePath("/pedidos");
      revalidatePath("/financeiro");
      revalidatePath("/cancelamentos");
    }
  } catch (error) {
    console.error("tray sync", error instanceof Error ? error.message : "erro");
  }
}
