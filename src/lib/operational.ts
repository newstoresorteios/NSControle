export function panelPath(value: string | null | undefined, prefix: string, fallback: string) {
  if (!value || !value.startsWith(prefix) || value.startsWith("//") || value.includes("://")) return fallback;
  const bare = value.split("#")[0];
  if (!/^\/[A-Za-z0-9\-/_?=&%.+]*$/.test(bare)) return fallback;
  return bare;
}

export function pathWith(path: string, key: string, value: string) {
  const url = new URL(path, "http://painel.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function calendarDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? value
    : null;
}

export function nonnegativeMoney(raw: string): { ok: boolean; value: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return { ok: false, value: null };
  const value = Number(normalized);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: null };
}
