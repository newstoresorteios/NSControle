import assert from "node:assert/strict";
import test from "node:test";
import { taxQueueStatus } from "./taxes.ts";

test("identified charge without a value waits for research", () => {
  assert.equal(taxQueueStatus({ tax_identified_at: "2026-10-16", import_tax: null, tax_paid: false }), "sem_valor");
});

test("entering an amount does not imply payment", () => {
  assert.equal(taxQueueStatus({ tax_identified_at: "2026-10-16", import_tax: "100", tax_paid: false }), "a_pagar");
  assert.equal(taxQueueStatus({ tax_identified_at: "2026-10-16", import_tax: "100", tax_paid: true }), "paga");
});
