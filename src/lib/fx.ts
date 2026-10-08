const SUPPORTED = /^[A-Z]{3}$/;

export type PtaxQuote = {
  rate: number;
  quoteDate: string;
};

export function ptaxVenda(body: unknown): number | null {
  if (!body || typeof body !== "object" || !("value" in body) || !Array.isArray(body.value)) return null;
  const rows = body.value.filter((row): row is { cotacaoVenda: number; tipoBoletim?: string } => {
    return Boolean(row && typeof row === "object" && typeof (row as { cotacaoVenda?: unknown }).cotacaoVenda === "number");
  });
  const closing = [...rows].reverse().find((row) => row.tipoBoletim?.toLowerCase().includes("fechamento"));
  const chosen = closing ?? rows.at(-1);
  if (!chosen || chosen.cotacaoVenda <= 0) return null;
  return Math.round(chosen.cotacaoVenda * 1_000_000) / 1_000_000;
}

export function previousIsoDate(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function bcbDate(iso: string): string | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[2]}-${match[3]}-${match[1]}`;
}

export async function ptaxRate(currency: string, isoDate: string): Promise<PtaxQuote | null> {
  const code = currency.trim().toUpperCase();
  if (!SUPPORTED.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  if (code === "BRL") return { rate: 1, quoteDate: isoDate };
  let cursor: string | null = isoDate;
  for (let attempt = 0; attempt < 10 && cursor; attempt += 1) {
    const rate = await ptaxDay(code, cursor);
    if (rate) return { rate, quoteDate: cursor };
    cursor = previousIsoDate(cursor);
  }
  return null;
}

async function ptaxDay(currency: string, isoDate: string): Promise<number | null> {
  const quoted = bcbDate(isoDate);
  if (!quoted) return null;
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)" +
    `?@moeda='${currency}'&@dataCotacao='${quoted}'&$format=json&$select=cotacaoVenda,tipoBoletim`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return ptaxVenda(await response.json());
  } catch {
    return null;
  }
}
