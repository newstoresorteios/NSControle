import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCIAL_STATUSES, INVENTORY_STATUSES, listedValue } from "./lists.ts";

test("aceita o status comercial e o da peça pelo nome usado no painel", () => {
  assert.equal(listedValue(COMMERCIAL_STATUSES, "entregue"), "ENTREGUE");
  assert.equal(listedValue(COMMERCIAL_STATUSES, "A enviar Vindi"), "A ENVIAR VINDI");
  assert.equal(listedValue(INVENTORY_STATUSES, "vendido"), "Vendido");
  assert.equal(listedValue(COMMERCIAL_STATUSES, "Comprado"), null);
  assert.equal(listedValue(INVENTORY_STATUSES, ""), null);
});
