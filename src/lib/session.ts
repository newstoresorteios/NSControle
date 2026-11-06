import { requestUser } from "./request-user.ts";

export const SESSION_COOKIE = "ns-controle-session";
const DAY = 24 * 60 * 60 * 1000;

type Session = { id: string; email: string };

function sessionSecret() {
  return process.env.NS_SESSION_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encode(new Uint8Array(signature));
}

function same(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export async function signSession(session: Session, now = Date.now()) {
  const body = encode(new TextEncoder().encode(JSON.stringify({ ...session, exp: now + 14 * DAY })));
  const signature = await sign(body);
  if (!signature) return "";
  return `${body}.${signature}`;
}

export async function readSession(token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || token.split(".").length !== 2) return null;
  const expected = await sign(body);
  if (!expected || !same(signature, expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decode(body))) as { id?: string; email?: string; exp?: number };
    if (!parsed.exp || parsed.exp < now) return null;
    return requestUser(parsed.id ?? null, parsed.email ?? null);
  } catch {
    return null;
  }
}
