export function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

export function decimal(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export function integer(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (!raw) return null;
  const number = Number(raw);
  return Number.isInteger(number) ? number : null;
}

export function flag(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export function monthDate(formData: FormData, name: string): string | null {
  const raw = text(formData, name);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}
