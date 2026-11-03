import assert from "node:assert/strict";
import test from "node:test";
import { estimateLucroReal } from "./finance-lucro-real.ts";

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual ?? 0) - expected) < 0.05, `${actual} ≈ ${expected}`);
}

test("lucro real RJ com compra preenchida e crédito ICMS integral", () => {
  const result = estimateLucroReal(
    [
      {
        sale_amount: 1000,
        purchase_amount: 400,
        payment_fee: 30,
        shipping_cost: 20,
        import_tax: 50,
      },
    ],
    { icmsCreditFactor: 1, avgPaymentFee: 0, avgShipping: 0 },
  );
  close(result.vendas, 1000);
  close(result.compraTotal, 400);
  close(result.custosOperacionais, 500);
  close(result.lucroOperacional, 500);
  close(result.pisCofinsDebito, 92.5);
  close(result.pisCofinsCredito, 37);
  close(result.pisCofinsLiquido, 55.5);
  close(result.icmsDebito, 200);
  close(result.icmsCredito, 80);
  close(result.icmsLiquido, 120);
  close(result.baseIrpjCsll, 324.5);
  // IRPJ 15% + CSLL 9% + adicional 10% sobre (324.5 - 20000) = 0 adicional
  close(result.irpj, 48.675);
  close(result.irpjAdicional, 0);
  close(result.csll, 29.205);
  close(result.lucroLiquido, 246.62);
  assert.equal(result.pedidosSemCompra, 0);
});

test("estima compra e fee/frete quando faltam; crédito ICMS 70%", () => {
  const result = estimateLucroReal(
    [
      {
        sale_amount: 1000,
        purchase_amount: null,
        payment_fee: null,
        shipping_cost: null,
        import_tax: null,
      },
    ],
    {
      purchasePctOfSale: 0.5,
      avgPaymentFee: 100,
      avgShipping: 50,
      icmsCreditFactor: 0.7,
    },
  );
  close(result.compraEstimada, 500);
  close(result.taxaPgtoEstimada, 100);
  close(result.freteEstimado, 50);
  assert.equal(result.pedidosSemCompra, 1);
  close(result.icmsCredito, 500 * 0.2 * 0.7);
  assert.ok(result.lucroLiquido < result.lucroOperacional);
});

test("mês vazio zera totais", () => {
  const result = estimateLucroReal([]);
  assert.equal(result.vendas, 0);
  assert.equal(result.lucroLiquido, 0);
  assert.equal(result.margemLiquida, null);
});
