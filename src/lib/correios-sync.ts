import { revalidatePath } from "next/cache";
import { CorreiosRequestError, correiosConfigured, trackObjects } from "@/lib/correios-client";
import { statusFromEvent } from "@/lib/correios-map";
import { db } from "@/lib/db";

const BATCH = 20;
const INTERVAL_MS = 10 * 60 * 1000;
const LOCK_MS = 90 * 1000;

export type CorreiosReport = {
  ok: boolean;
  reason: string;
  checked: number;
  updated: number;
  missing: number;
  failures: number;
};

function empty(reason: string, ok: boolean): CorreiosReport {
  return { ok, reason, checked: 0, updated: 0, missing: 0, failures: 0 };
}

async function claim(force: boolean): Promise<number | null> {
  await db()`insert into ctl_tray_sync (id) values ('correios') on conflict (id) do nothing`;
  const rows = await db()<{ last_run_at: string | null; last_status: string | null; cursor_page: number }[]>`
    select last_run_at, last_status, cursor_page
    from ctl_tray_sync
    where id = 'correios'
    limit 1
  `;
  const state = rows[0];
  if (!state) return null;
  const last = state.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  const age = Number.isNaN(last) ? INTERVAL_MS : Date.now() - last;
  if (state.last_status === "running" && age < LOCK_MS) return null;
  if (!force && state.last_status === "ok" && age < INTERVAL_MS) return null;
  if (!force && state.last_status === "limite" && age < 2 * 60 * 1000) return null;
  await db()`
    update ctl_tray_sync
    set last_status = 'running', last_run_at = now(), last_error = null
    where id = 'correios'
  `;
  return Number(state.cursor_page) || 0;
}

async function finish(status: string, error: string | null, cursor: number, report: CorreiosReport) {
  await db()`
    update ctl_tray_sync set
      cursor_page = ${cursor},
      last_run_at = now(),
      last_status = ${status},
      last_error = ${error},
      last_report = ${db().json({ checked: report.checked, updated: report.updated, missing: report.missing, failures: report.failures })}
    where id = 'correios'
  `;
}

async function codesAt(offset: number) {
  return db()<{ tracking_code: string }[]>`
    select tracking_code from (
      select upper(trim(tracking_code)) as tracking_code,
             min(tracking_event_at) as event_at
      from ctl_orders
      where delivered = false
        and tracking_code ~ '^[A-Za-z]{2}[0-9]{9}[A-Za-z]{2}$'
      group by 1
    ) codes
    order by event_at asc nulls first, tracking_code
    offset ${offset}
    limit ${BATCH}
  `;
}

export async function runCorreiosSync(options?: { force?: boolean }): Promise<CorreiosReport> {
  if (!correiosConfigured()) return empty("nao_configurado", false);
  let cursor: number | null;
  try {
    cursor = await claim(options?.force === true);
  } catch (error) {
    console.error("correios sync", error instanceof Error ? error.message : "erro");
    return empty("erro", false);
  }
  if (cursor == null) return empty("aguardando", true);

  const report = empty("ok", true);
  let nextCursor = cursor;
  try {
    let start = cursor;
    let rows = await codesAt(start);
    if (!rows.length && start > 0) {
      start = 0;
      rows = await codesAt(0);
    }
    const codes = rows.map((row) => row.tracking_code);
    report.checked = codes.length;
    if (codes.length) {
      const objects = await trackObjects(codes);
      const seen = new Set<string>();
      for (const object of objects) {
        if (!object.code) continue;
        seen.add(object.code);
        if (!object.event) {
          report.missing += 1;
          continue;
        }
        const status = statusFromEvent(object.event);
        if (!status) {
          report.missing += 1;
          continue;
        }
        await db()`
          update ctl_orders set
            tracking_correios = ${status.tracking_correios},
            tracking_situation = ${status.tracking_situation},
            tracking_event_at = ${status.tracking_event_at},
            delivered = ${status.delivered}
          where delivered = false
            and upper(trim(tracking_code)) = ${object.code}
        `;
        report.updated += 1;
      }
      report.missing += codes.filter((code) => !seen.has(code)).length;
    }
    nextCursor = codes.length < BATCH ? 0 : start + codes.length;
    await finish("ok", null, nextCursor, report);
    return report;
  } catch (error) {
    const limited = error instanceof CorreiosRequestError && error.status === 429;
    if (!limited) console.error("correios sync", error instanceof Error ? error.message : "erro");
    await finish(limited ? "limite" : "erro", limited ? "limite" : "erro", nextCursor, report).catch(() => undefined);
    return { ...report, ok: false, reason: limited ? "limite" : "erro" };
  }
}

export async function scheduleCorreiosSync() {
  if (!correiosConfigured()) return false;
  try {
    const report = await runCorreiosSync({ force: false });
    if (report.updated > 0) {
      revalidatePath("/");
      revalidatePath("/pedidos");
      return true;
    }
    return false;
  } catch (error) {
    console.error("correios sync", error instanceof Error ? error.message : "erro");
    return false;
  }
}
