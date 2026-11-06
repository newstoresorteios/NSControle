import assert from "node:assert/strict";
import test from "node:test";
import { accountEmail, validUsername } from "./accounts.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";
import { readSession, signSession } from "./session.ts";

test("aceita o usuário curto e monta o e-mail interno", () => {
  assert.equal(validUsername("felipe"), true);
  assert.equal(validUsername("Joao"), false);
  assert.equal(validUsername("a"), false);
  assert.equal(accountEmail("tironi"), "tironi@team.nscontrole.app");
});

test("confere a senha gravada e recusa outra", () => {
  const stored = hashPassword("123456");
  assert.equal(verifyPassword("123456", stored), true);
  assert.equal(verifyPassword("1234567", stored), false);
  assert.equal(verifyPassword("123456", "texto"), false);
});

test("a sessão expira e não aceita assinatura trocada", async () => {
  process.env.NS_SESSION_SECRET = "teste-sessao";
  const id = "11111111-1111-4111-8111-111111111111";
  const token = await signSession({ id, email: "felipe@team.nscontrole.app" }, 1_000);
  assert.deepEqual(await readSession(token, 1_000), { id, email: "felipe@team.nscontrole.app" });
  assert.equal(await readSession(token, 1_000 + 15 * 24 * 60 * 60 * 1000), null);
  const [body] = token.split(".");
  assert.equal(await readSession(`${body}.assinatura`), null);
});
