export class TrayRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "TrayRequestError";
  }
}

export function trayConfigured(): boolean {
  return Boolean(process.env.TRAY_ADAPTER_URL?.trim() && process.env.TRAY_ADAPTER_TOKEN?.trim());
}

function adapterUrl(path: string, params?: Record<string, string>): URL {
  const base = process.env.TRAY_ADAPTER_URL?.trim();
  const token = process.env.TRAY_ADAPTER_TOKEN?.trim();
  if (!base || !token) throw new TrayRequestError("nao_configurado", 0);
  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return url;
}

export async function trayGet(path: string, params?: Record<string, string>): Promise<Record<string, unknown>> {
  const token = process.env.TRAY_ADAPTER_TOKEN?.trim();
  if (!token) throw new TrayRequestError("nao_configurado", 0);
  const response = await fetch(adapterUrl(path, params), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 429 || body.error === "tray_rate_limited") {
    throw new TrayRequestError("limite", 429);
  }
  if (!response.ok || body.success === false) {
    const code = typeof body.error === "string" ? body.error : "tray_error";
    throw new TrayRequestError(code, response.status);
  }
  return body;
}
