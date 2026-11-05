import assert from "node:assert/strict";
import test from "node:test";
import { taxPaymentText, taxQueueStatus } from "./taxes.ts";

test("identified charge without a value waits for research", () => {
  assert.equal(taxQueueStatus({ tax_identified_at: "2026-10-16", import_tax: null, tax_paid: false }), "sem_valor");
});

test("pagar taxa copia pedido, valor e linha digitável", () => {
  const linha = "23793.12925 69006.700509 59015.810803 7 16200000029436";
  assert.equal(
    taxPaymentText({ orderKey: "26438", amount: "294.36", linha }),
    "Pedido 26438\n\nValor: R$ 294,36\n\n23793129256900670050959015810803716200000029436",
  );
  assert.equal(
    taxPaymentText({ orderKey: "26438", amount: null, linha }),
    "Pedido 26438\n\nValor: R$ 294,36\n\n23793129256900670050959015810803716200000029436",
  );
  assert.equal(taxPaymentText({ orderKey: "26438", amount: "10", linha: "123" }), null);
  const thousands = `${"1".repeat(37)}0000129450`;
  assert.equal(taxPaymentText({ orderKey: "1", amount: 1294.5, linha: thousands }), `Pedido 1\n\nValor: R$ 1.294,50\n\n${thousands}`);
});

test("entering an amount does not imply payment", () => {
  assert.equal(taxQueueStatus({ tax_identified_at: "2026-10-16", import_tax: "100", tax_paid: false }), "a_pagar");
  assert.equal(taxQueueStatus({ tax_identified_at: "2026-10-16", import_tax: "100", tax_paid: true }), "paga");
});
