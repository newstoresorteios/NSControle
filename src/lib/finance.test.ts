import assert from "node:assert/strict";
import test from "node:test";
import { monthSummary, type MoneyOrder } from "./finance.ts";

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual ?? 0) - expected) < 0.02, `${actual} ≈ ${expected}`);
}

const blank = {
  purchase_amount: null,
  payment_fee: null,
  shipping_cost: null,
  import_tax: null,
};

test("agosto só com encomenda fecha como o cabeçalho da planilha", () => {
  const orders: MoneyOrder[] = [
    {
      flow: "encomenda",
      sale_amount: 133854.72,
      ...blank,
      payment_fee: 27090.48,
    },
  ];
  const summary = monthSummary(orders, 1_400_000, "2026-08", new Date(2026, 8, 1));
  close(summary.vendasLoja, 0);
  close(summary.vendasEncomenda, 133854.72);
  close(summary.vendasLojas, 133854.72);
  close(summary.custoCompra, 0);
  close(summary.taxas, 27090.48);
  close(summary.custoTotal, 27090.48);
  close(summary.resultado, 106764.24);
  close(summary.margem, 0.7976);
  close(summary.retorno, 3.941);
  close(summary.markup, 4.941);
  close(summary.falta, 1_266_145.28);
  close(summary.percentual, 0.0956);
  assert.equal(summary.semCompra, 1);
  assert.equal(summary.semTaxa, 0);
  assert.equal(summary.semEnvio, 1);
  close(summary.mediaVenda, 133854.72);
  close(summary.mediaTaxa, 27090.48);
  assert.equal(summary.mediaEnvio, null);
});

test("resultado soma loja nova e encomenda antes de tirar o custo", () => {
  const orders: MoneyOrder[] = [
    {
      flow: "loja_nova",
      sale_amount: 305296.98,
      ...blank,
    },
    {
      flow: "encomenda",
      sale_amount: 792310.52,
      purchase_amount: 192946,
      payment_fee: 66374.42,
      shipping_cost: null,
      import_tax: null,
    },
  ];
  const summary = monthSummary(orders, 1_400_000, "2026-08", new Date(2026, 8, 1));
  close(summary.vendasLojas, 1_097_607.5);
  close(summary.custoTotal, 259320.42);
  close(summary.resultado, 838287.08);
  close(summary.percentual, 0.784);
  assert.equal(summary.semCompra, 1);
  close(summary.mediaCusto, 192946);
  close(summary.mediaTaxa, 66374.42);
});

test("média ignora linha sem valor", () => {
  const orders: MoneyOrder[] = [
    { flow: "loja_nova", sale_amount: 100, purchase_amount: 40, payment_fee: null, shipping_cost: 10, import_tax: null },
    { flow: "loja_nova", sale_amount: 300, purchase_amount: null, payment_fee: null, shipping_cost: 30, import_tax: null },
  ];
  const summary = monthSummary(orders, null, "2026-10", new Date(2026, 9, 6));
  close(summary.mediaVenda, 200);
  close(summary.mediaCusto, 40);
  assert.equal(summary.mediaTaxa, null);
  close(summary.mediaEnvio, 20);
  close(summary.retorno, 4);
  assert.equal(monthSummary([], null, "2026-10").retorno, null);
});
