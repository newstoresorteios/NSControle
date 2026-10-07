export const FLOW_LABEL: Record<string, string> = {
  encomenda: "Sob encomenda",
  loja_nova: "Loja nova",
  ns_creditos: "NS Créditos",
};

export function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function brl(value: unknown): string {
  const number = asNumber(value);
  if (number == null) return "—";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function percent(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(year, mon - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}
