import assert from "node:assert/strict";
import test from "node:test";
import { bcbDate, previousIsoDate, ptaxVenda } from "./fx.ts";
import { allocateInvoice, paymentSummary, type MoneyLine } from "./invoice-cost.ts";

test("PTAX usa o fechamento", () => {
  const rate = ptaxVenda({
    value: [
      { cotacaoVenda: 5.5821, tipoBoletim: "Abertura" },
      { cotacaoVenda: 5.5975, tipoBoletim: "Fechamento PTAX" },
    ],
  });
  assert.equal(rate, 5.5975);
  assert.equal(ptaxVenda({ value: [] }), null);
  assert.equal(bcbDate("2026-10-06"), "10-06-2026");
  assert.equal(previousIsoDate("2026-10-06"), "2026-10-05");
});

test("o custo médio usa o total convertido e a quantidade de produtos", () => {
  const summary = paymentSummary(caLines(), 1618.51, 5.5975);
  assert.equal(summary.items, 5);
  assert.equal(summary.foreign, 1618.51);
  assert.equal(summary.brl, 9059.61);
  assert.equal(summary.average, 1811.92);
});

test("a taxa entra no custo do pedido e a soma fecha o total", () => {
  const { orders } = allocateInvoice(caLines());
  const total = orders.reduce((sum, order) => sum + order.foreignAmount, 0);
  assert.equal(Math.round(total * 100) / 100, 1618.51);
  const shared = orders.find((order) => order.orderId === "26228");
  assert.ok(shared);
  assert.ok((shared?.foreignAmount ?? 0) > 49.95 + 45);
});

test("uma linha com vários pedidos divide o custo", () => {
  const lines: MoneyLine[] = [
    { id: "a", kind: "produto", quantity: 2, lineAmount: 100, orderIds: ["p1", "p2"] },
    { id: "b", kind: "taxa", quantity: 1, lineAmount: 10, orderIds: [] },
  ];
  const { orders } = allocateInvoice(lines);
  assert.equal(orders.find((order) => order.orderId === "p1")?.foreignAmount, 55);
  assert.equal(orders.find((order) => order.orderId === "p2")?.foreignAmount, 55);
});

function caLines(): MoneyLine[] {
  const products = [
    ["26184", 255.43],
    ["26214", 185],
    ["26228", 49.95],
    ["26228", 45],
    ["25942", 1036],
  ] as const;
  return [
    { id: "fee", kind: "taxa", quantity: 1, lineAmount: 47.13, orderIds: [] },
    ...products.map(([orderId, lineAmount], index) => ({
      id: `p${index}`,
      kind: "produto",
      quantity: 1,
      lineAmount,
      orderIds: [orderId],
    })),
  ];
}
