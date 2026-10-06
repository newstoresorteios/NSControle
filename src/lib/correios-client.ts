import { type CorreiosEvent, latestEvent } from "@/lib/correios-map";

export class CorreiosRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "CorreiosRequestError";
  }
}

type TokenCache = { token: string; expiresAt: number };

const globalForCorreios = globalThis as unknown as { correiosToken?: TokenCache };

export function correiosConfigured(): boolean {
  return Boolean(
    process.env.CORREIOS_USUARIO?.trim() &&
      process.env.CORREIOS_SENHA?.trim() &&
      process.env.CORREIOS_CARTAO?.trim(),
  );
}

function apiBase() {
  const base = (process.env.CORREIOS_API_URL || "https://api.correios.com.br").trim().replace(/\/$/, "");
  return `${base}/`;
}

function credentials() {
  const usuario = process.env.CORREIOS_USUARIO?.trim();
  const senha = process.env.CORREIOS_SENHA?.trim();
  const cartao = process.env.CORREIOS_CARTAO?.trim();
  if (!usuario || !senha || !cartao) throw new CorreiosRequestError("nao_configurado", 0);
  return { usuario, senha, cartao };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function token(force: boolean): Promise<string> {
  const cached = globalForCorreios.correiosToken;
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { usuario, senha, cartao } = credentials();
  const body: Record<string, string | number> = { numero: cartao };
  const contrato = process.env.CORREIOS_CONTRATO?.trim();
  const dr = process.env.CORREIOS_DR?.trim();
  if (contrato) body.contrato = contrato;
  if (dr && Number.isFinite(Number(dr))) body.dr = Number(dr);
  const response = await fetch(new URL("token/v1/autentica/cartaopostagem", apiBase()), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${usuario}:${senha}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await readJson(response);
  if (response.status === 429) throw new CorreiosRequestError("limite", 429);
  const value = typeof payload.token === "string" ? payload.token : "";
  if (!response.ok || !value) throw new CorreiosRequestError("token", response.status || 502);
  const expires = payload.expiraEm ? new Date(String(payload.expiraEm)).getTime() : Date.now() + 50 * 60 * 1000;
  globalForCorreios.correiosToken = { token: value, expiresAt: Number.isNaN(expires) ? Date.now() + 50 * 60 * 1000 : expires };
  return value;
}

export type CorreiosObject = {
  code: string;
  event: CorreiosEvent | null;
  missing: boolean;
};

export async function trackObjects(codes: string[]): Promise<CorreiosObject[]> {
  if (!codes.length) return [];
  const bearer = await token(false);
  let response: Response;
  try {
    response = await ask(bearer, codes);
  } catch (error) {
    if (!(error instanceof CorreiosRequestError) || error.status !== 401) throw error;
    response = await ask(await token(true), codes);
  }
  const payload = await readJson(response);
  if (response.status === 429) throw new CorreiosRequestError("limite", 429);
  if (!response.ok) throw new CorreiosRequestError("rastro", response.status || 502);
  const objects = Array.isArray(payload.objetos) ? (payload.objetos as Array<Record<string, unknown>>) : [];
  return objects.map((object) => {
    const code = String(object.codObjeto || "").trim().toUpperCase();
    const events = Array.isArray(object.eventos) ? (object.eventos as CorreiosEvent[]) : [];
    const event = latestEvent(events);
    return { code, event, missing: !event };
  });
}

async function ask(bearer: string, codes: string[]) {
  const url = new URL("srorastro/v1/objetos", apiBase());
  for (const code of codes) url.searchParams.append("codigosObjetos", code);
  url.searchParams.set("resultado", "U");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (response.status === 401) throw new CorreiosRequestError("token", 401);
  return response;
}
