import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "ns-controle-logins-v1";

let cachedMaterial = "";
let cachedKey: Buffer | null = null;

function vaultKey() {
  const material = process.env.VAULT_KEY || process.env.NS_SESSION_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (material === cachedMaterial) return cachedKey;
  cachedMaterial = material;
  cachedKey = material ? scryptSync(material, SALT, 32) : null;
  return cachedKey;
}

export function sealSecret(plain: string) {
  const key = vaultKey();
  if (!key) throw new Error("Cofre sem chave");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function openSecret(sealed: string | null | undefined) {
  const key = vaultKey();
  if (!key || !sealed) return null;
  const [version, ivText, tagText, dataText] = sealed.split(".");
  if (version !== "v1" || !ivText || !tagText || !dataText) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
