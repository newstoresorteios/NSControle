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

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/** Prefer CORREIOS_API_* names; keep legacy CORREIOS_USUARIO/SENHA/CARTAO. */
export function correiosEnv() {
  return {
    apiUrl: env("CORREIOS_API_URL") || "https://api.correios.com.br",
    usuario: env("CORREIOS_API_USER", "CORREIOS_API_USUARIO", "CORREIOS_USUARIO"),
    senha: env("CORREIOS_API_TOKEN", "CORREIOS_API_SENHA", "CORREIOS_SENHA"),
    cartao: env("CORREIOS_API_CARTAO", "CORREIOS_CARTAO"),
    contrato: env("CORREIOS_API_CONTRATO", "CORREIOS_CONTRATO"),
    dr: env("CORREIOS_API_DR", "CORREIOS_DR"),
    mock: env("CORREIOS_API_MOCK") === "1",
  };
}

export function correiosConfigured(): boolean {
  if (correiosEnv().mock) return true;
  const { usuario, senha } = correiosEnv();
  return Boolean(usuario && senha);
}

function apiBase() {
  return `${correiosEnv().apiUrl.replace(/\/$/, "")}/`;
}

function credentials() {
  const { usuario, senha, cartao, contrato, dr, mock } = correiosEnv();
  if (mock) return { usuario: "mock", senha: "mock", cartao: "", contrato: "", dr: "" };
  if (!usuario || !senha) throw new CorreiosRequestError("nao_configurado", 0);
  return { usuario, senha, cartao, contrato, dr };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function token(force: boolean): Promise<string> {
  if (correiosEnv().mock) return "mock-token";
  const cached = globalForCorreios.correiosToken;
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { usuario, senha, cartao, contrato, dr } = credentials();
  const path = cartao ? "token/v1/autentica/cartaopostagem" : "token/v1/autentica";
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${usuario}:${senha}`).toString("base64")}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (cartao) {
    headers["Content-Type"] = "application/json";
    const payload: Record<string, string | number> = { numero: cartao };
    if (contrato) payload.contrato = contrato;
    if (dr && Number.isFinite(Number(dr))) payload.dr = Number(dr);
    body = JSON.stringify(payload);
  }
  const response = await fetch(new URL(path, apiBase()), {
    method: "POST",
    headers,
    body,
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

const MOCK_EVENTS: Record<string, CorreiosEvent> = {
  AA123456789BR: {
    codigo: "BDE",
    tipo: "01",
    descricao: "Objeto entregue ao destinatário",
    dtHrCriado: "2026-11-20T14:30:00",
  },
  LX123456789ES: {
    codigo: "PO",
    tipo: "01",
    descricao: "Objeto em trânsito - por favor aguarde",
    dtHrCriado: "2026-11-22T09:00:00",
  },
};

function mockTrack(codes: string[]): CorreiosObject[] {
  return codes.map((code) => {
    const event = MOCK_EVENTS[code] || {
      codigo: "OEC",
      tipo: "01",
      descricao: "Objeto em trânsito - por favor aguarde",
      dtHrCriado: new Date().toISOString().replace(/\.\d{3}Z$/, "").slice(0, 19),
    };
    return { code, event, missing: false };
  });
}

export async function trackObjects(codes: string[]): Promise<CorreiosObject[]> {
  if (!codes.length) return [];
  if (correiosEnv().mock) return mockTrack(codes);
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
