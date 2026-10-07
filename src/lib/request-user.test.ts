import assert from "node:assert/strict";
import test from "node:test";
import { requestUser } from "./request-user.ts";

const ID = "11111111-1111-4111-8111-111111111111";

test("aceita o usuário gravado pelo middleware", () => {
  assert.deepEqual(requestUser(ID, "Loja@NewStore.com"), {
    id: ID,
    email: "loja@newstore.com",
  });
});

test("recusa cabeçalho ausente, id inválido ou e-mail inválido", () => {
  assert.equal(requestUser(null, "loja@newstore.com"), null);
  assert.equal(requestUser("admin", "loja@newstore.com"), null);
  assert.equal(requestUser(ID, "nao-e-email"), null);
  assert.equal(requestUser(ID, "loja@newstore.com\r\n"), null);
});
