import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "ns-controle-logins-v1";
const SOURCES = ["VAULT_KEY", "NS_SESSION_SECRET", "DATABASE_URL", "POSTGRES_URL"] as const;

const derived = new Map<string, Buffer>();

function normalize(value: string) {
  return value.replace(/([?&])channel_binding=[^&]*/g, "$1").replace(/\?&/, "?").replace(/[?&]$/, "");
}

function materials() {
  const found = new Set<string>();
  for (const name of SOURCES) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    found.add(value);
    const normalized = normalize(value);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

function keyFor(material: string) {
  const cached = derived.get(material);
  if (cached) return cached;
  const key = scryptSync(material, SALT, 32);
  derived.set(material, key);
  return key;
}

function decrypt(sealed: string, key: Buffer) {
  const [version, ivText, tagText, dataText] = sealed.split(".");
  if (version !== "v1" || !ivText || !tagText || !dataText) return null;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]);
  return plain.toString("utf8");
}

export function sealSecret(plain: string) {
  const material = materials()[0];
  if (!material) throw new Error("Cofre sem chave");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(material), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function openSecret(sealed: string | null | undefined) {
  if (!sealed) return null;
  for (const material of materials()) {
    try {
      const plain = decrypt(sealed, keyFor(material));
      if (plain) return plain;
    } catch {
      derived.delete(material);
    }
  }
  return null;
}
