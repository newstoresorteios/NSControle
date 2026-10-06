import { revalidatePath } from "next/cache";
import { runBiSync } from "@/lib/bi-sync";
import { db, insertRow, updateRow } from "@/lib/db";
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

async function readState(): Promise<SyncState> {
  const rows = await db()<Record<string, unknown>[]>`select * from ctl_tray_sync where id = 'orders' limit 1`;
  const data = rows[0];
  if (!data) throw new TrayRequestError("sync_state", 500);
  return {
    cursor_page: Number(data?.cursor_page) || 1,
    watermark: data?.watermark ? String(data.watermark).slice(0, 10) : null,
    backfill_done: data?.backfill_done === true,
    last_event_id: Number(data?.last_event_id) || 0,
    last_run_at: data?.last_run_at ? String(data.last_run_at) : null,
    last_status: data?.last_status ? String(data.last_status) : null,
  };
}

async function claim(force: boolean): Promise<SyncState | null> {
  const state = await readState();
  const last = state.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  const age = Number.isNaN(last) ? INTERVAL_MS : Date.now() - last;
  if (state.last_status === "running" && age < LOCK_MS) return null;
  if (!force && state.last_status === "ok" && age < INTERVAL_MS) return null;
  if (!force && state.last_status === "limite" && age < 2 * 60 * 1000) return null;
  await db()`
    insert into ctl_tray_sync (id, last_status, last_run_at, last_error)
    values ('orders', 'running', now(), null)
    on conflict (id) do update
      set last_status = 'running', last_run_at = now(), last_error = null
  `;
  return state;
}

async function finish(status: string, error: string | null, progress: Progress) {
  const report = {
    listed: progress.listed,
    fetched: progress.fetched,
    upserted: progress.upserted,
    skipped: progress.skipped,
    cancellations: progress.cancellations,
    failures: progress.failures,
  };
  await db()`
    update ctl_tray_sync set
      cursor_page = ${progress.page},
      watermark = ${progress.watermark},
      backfill_done = ${progress.backfillDone},
      last_event_id = ${progress.eventCursor},
      last_run_at = now(),
      last_status = ${status},
      last_error = ${error},
      last_report = ${db().json(report)}
    where id = 'orders'
  `;
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

async function findLoja(key: string): Promise<StoredOrder | null> {
  const rows = await db()<StoredOrder[]>`
    select ${db().unsafe(ORDER_COLUMNS)}
    from ctl_orders
    where order_key = ${key} and flow = 'loja_nova'
    order by finance_month desc nulls last
    limit 1
  `;
  return rows[0] ?? null;
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

async function writeOrder(existing: StoredOrder | null, draft: TrayDraft): Promise<string | null> {
  const merged = mergeTrayOrder(existing, draft);
  if (!existing || merged.mode === "insert") {
    try {
      const inserted = await insertRow("ctl_orders", merged.row);
      return String(inserted.id);
    } catch (error) {
      if (!isUnique(error)) throw new TrayRequestError("order_insert", 500);
      const again = await findLoja(draft.order_key);
      if (!again) throw new TrayRequestError("order_insert", 500);
      return saveOrder(again.id, mergeTrayOrder(again, draft).row);
    }
  }
  try {
    return await saveOrder(existing.id, merged.row);
  } catch (error) {
    if (!(error instanceof TrayRequestError) || error.code !== "order_conflict") throw error;
    const rest = { ...merged.row };
    delete rest.finance_month;
    delete rest.finance_month_key;
    return saveOrder(existing.id, rest);
  }
}

async function saveOrder(id: string, row: Record<string, unknown>): Promise<string> {
  try {
    await updateRow("ctl_orders", row, "id", id);
  } catch (error) {
    if (isUnique(error)) throw new TrayRequestError("order_conflict", 409);
    throw new TrayRequestError("order_update", 500);
  }
  return id;
}

async function writeCancellation(draft: TrayDraft, orderId: string | null) {
  const cancel = cancellationFromTray(draft, orderId);
  if (!cancel) return false;
  const existing = await db()<{ id: string }[]>`
    select id from ctl_cancellations where order_key = ${draft.order_key} limit 1
  `;
  if (existing.length > 0) return false;
  try {
    await insertRow("ctl_cancellations", cancel);
    return true;
  } catch {
    return false;
  }
}

async function pullOne(key: string, listedModified: unknown) {
  const complete = await trayGet(`/internal/orders/${key}/complete`);
  const draft = buildTrayDraft(complete as TrayComplete);
  if (!draft) return { upserted: false, cancellation: false };
  if (!draft.tray_modified_at) draft.tray_modified_at = trayTimeIso(listedModified);
  const existing = await findLoja(key);
  const orderId = await writeOrder(existing, draft);
  const cancellation = await writeCancellation(draft, orderId);
  if (draft.tracking_code && orderId) {
    await db()`
      update ctl_inventory_items set order_id = ${orderId}
      where tracking_code = ${draft.tracking_code} and order_id is null
    `;
  }
  return { upserted: true, cancellation };
}

async function take(progress: Progress, seen: Set<string>, key: string, modified: unknown) {
  if (progress.fetched > 0) await pause();
  progress.fetched += 1;
  seen.add(key);
  try {
    const result = await pullOne(key, modified);
    if (result.upserted) progress.upserted += 1;
    if (result.cancellation) progress.cancellations += 1;
  } catch (error) {
    if (isLimit(error)) throw error;
    progress.failures += 1;
  }
}

async function execute(state: SyncState, progress: Progress, today: string) {
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
    await take(progress, seen, key, null);
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
      const storedRows = await db()<{ tray_modified_at: string | null }[]>`
        select tray_modified_at from ctl_orders
        where order_key = ${key} and flow = 'loja_nova'
        limit 1
      `;
      const stored = storedRows[0]?.tray_modified_at ? String(storedRows[0].tray_modified_at) : null;
      if (isSameTrayVersion(stored, order.modified)) {
        progress.skipped += 1;
        continue;
      }
      if (progress.fetched >= BATCH) {
        pendingLeft = true;
        break;
      }
      await take(progress, seen, key, order.modified);
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

export async function runTraySync(options?: { force?: boolean }): Promise<SyncReport> {
  if (!trayConfigured()) return empty("nao_configurado", false);

  let state: SyncState | null;
  try {
    state = await claim(options?.force === true);
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
    await execute(state, progress, today);
    if (progress.backfillDone) progress.watermark = addIsoDays(today, -2);
    await finish("ok", null, progress);
    return reportFrom(progress, "ok", true);
  } catch (error) {
    const limited = isLimit(error);
    if (!limited) console.error("tray sync", error instanceof Error ? error.message : "erro");
    await finish(limited ? "limite" : "erro", limited ? "limite" : "erro", progress).catch(() => undefined);
    return reportFrom(progress, limited ? "limite" : "erro", false);
  }
}

export async function scheduleTraySync() {
  try {
    const bi = await runBiSync();
    if (bi.reason === "ok") {
      if (bi.upserted > 0) {
        revalidatePath("/");
        revalidatePath("/pedidos");
        revalidatePath("/financeiro");
        revalidatePath("/cancelamentos");
      }
      return;
    }
  } catch (error) {
    console.error("bi sync", error instanceof Error ? error.message : "erro");
  }
  if (!trayConfigured()) return;
  try {
    const report = await runTraySync({ force: false });
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
