import assert from "node:assert/strict";
import test from "node:test";
import { openSecret, sealSecret } from "./vault.ts";

test("a senha cifrada abre de volta e um texto trocado não abre", () => {
  process.env.VAULT_KEY = "chave-de-teste";
  const sealed = sealSecret("segredo-da-equipe");
  assert.equal(sealed.includes("segredo-da-equipe"), false);
  assert.equal(openSecret(sealed), "segredo-da-equipe");
  const [version, iv, tag, data] = sealed.split(".");
  assert.equal(openSecret(`${version}.${iv}.${tag}.${data.slice(0, -2)}aa`), null);
  assert.equal(openSecret("texto"), null);
  assert.equal(openSecret(null), null);
});
