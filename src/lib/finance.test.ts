import assert from "node:assert/strict";
import test from "node:test";
import { approvedFinanceOrder, financeSlices, monthSummary, salesByTrayStore, type MoneyOrder } from "./finance.ts";
import { refundTotal } from "./refunds.ts";

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

test("a conta fica só com pedido aprovado", () => {
  assert.equal(approvedFinanceOrder({ commercial_status: "A ENVIAR", data_source: "tray", sale_amount: 10, payment_date: "2026-11-01" }), true);
  assert.equal(approvedFinanceOrder({ commercial_status: "ENVIADO", data_source: "tray", sale_amount: 10, payment_date: null }), true);
  assert.equal(approvedFinanceOrder({ commercial_status: null, data_source: "tray", sale_amount: 10, payment_date: "2026-11-01" }), true);
  assert.equal(approvedFinanceOrder({ commercial_status: "CANCELADO", data_source: "tray", sale_amount: 10, payment_date: "2026-11-01" }), false);
  assert.equal(approvedFinanceOrder({ commercial_status: "AGUARDANDO PAGAMENTO", data_source: "tray", sale_amount: null, payment_date: null }), false);
  assert.equal(approvedFinanceOrder({ commercial_status: "AGUARDANDO VINDI", data_source: "planilha", sale_amount: 10, payment_date: "2026-11-01" }), false);
  assert.equal(approvedFinanceOrder({ commercial_status: "A ENVIAR", data_source: "tray", sale_amount: null, payment_date: null }), false);
  assert.equal(approvedFinanceOrder({ commercial_status: null, data_source: "planilha", sale_amount: 10, payment_date: null }), true);
});

test("vendas da loja nova separam 687890 e 1490060", () => {
  const totals = salesByTrayStore([
    { order_key: "26726", flow: "loja_nova", sale_amount: 100, ...blank },
    { order_key: "1490060:479", flow: "loja_nova", sale_amount: 40, ...blank },
    { order_key: "477", label: "Pedido 477 · 1490060", flow: "loja_nova", sale_amount: 10, ...blank },
    { order_key: "encomenda-1", flow: "encomenda", sale_amount: 80, ...blank },
  ]);
  close(totals["687890"], 100);
  close(totals["1490060"], 50);
});

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
  assert.equal(summary.semAlfandega, 1);
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

test("pronta entrega e origem Brasil não entram na conta de alfândega", () => {
  const orders: MoneyOrder[] = [
    { flow: "loja_nova", origin: "Pronta entrega", sale_amount: 200, purchase_amount: 80, payment_fee: null, shipping_cost: 15, import_tax: null },
    { flow: "loja_nova", origin: "Brasil", sale_amount: 100, purchase_amount: 40, payment_fee: null, shipping_cost: 10, import_tax: null },
    { flow: "loja_nova", origin: "Europa", sale_amount: 300, purchase_amount: null, payment_fee: null, shipping_cost: null, import_tax: null },
  ];
  const summary = monthSummary(orders, null, "2026-11", new Date(2026, 10, 18));
  assert.equal(summary.semAlfandega, 1);
  assert.equal(summary.semCompra, 1);
  assert.equal(summary.alfandega, 0);
});

test("cenário sintético deduz cada taxa uma vez e mostra devolução no mês realizado", () => {
  const order: MoneyOrder = {
    flow: "loja_nova",
    sale_amount: 1000,
    purchase_amount: 600,
    payment_fee: 30,
    shipping_cost: 20,
    import_tax: 50,
  };
  const summary = monthSummary([order], null, "2026-10", new Date(2026, 9, 16));
  assert.equal(summary.custoCompra, 600);
  assert.equal(summary.frete, 20);
  assert.equal(summary.alfandega, 50);
  assert.equal(summary.taxaMaquina, 30);
  assert.equal(summary.taxas, 100);
  assert.equal(summary.custoTotal, 700);
  assert.equal(summary.resultado, 300);

  const refund = [{ done_date: "2026-11-03", amount: "250" }];
  assert.equal(refundTotal(refund, "2026-10"), 0);
  assert.equal(refundTotal(refund, "2026-11"), 250);
  assert.equal(summary.resultado, 300);
});

test("separa as duas lojas e mantém a soma no total", () => {
  const orders: MoneyOrder[] = [
    { flow: "loja_nova", order_key: "26736", sale_amount: 100, purchase_amount: 40, payment_fee: null, shipping_cost: 10, import_tax: null },
    { flow: "loja_nova", order_key: "1490060:475", sale_amount: 40, purchase_amount: null, payment_fee: null, shipping_cost: 5, import_tax: null },
    { flow: "loja_nova", order_key: "477", label: "Pedido 477 · 1490060", sale_amount: 10, purchase_amount: null, payment_fee: null, shipping_cost: null, import_tax: null },
    { flow: "encomenda", order_key: "E1", sale_amount: 20, purchase_amount: 8, payment_fee: null, shipping_cost: null, import_tax: null },
  ];
  const slices = financeSlices(orders, "2026-11", new Date(2026, 10, 10));
  assert.deepEqual(slices.map((slice) => slice.label), ["New Store", "NS Relógios"]);
  close(slices[0].summary.vendas, 120);
  close(slices[0].summary.custoCompra, 48);
  close(slices[0].summary.frete, 10);
  close(slices[0].summary.alfandega, 0);
  close(slices[1].summary.frete, 5);
  close(slices[0].summary.custoTotal, 58);
  close(slices[0].summary.resultado, 62);
  close(slices[1].summary.vendas, 50);
  close(slices[1].summary.resultado, 45);
  assert.equal(slices[1].complete.count, 0);
  close(slices[0].complete.margem, 62 / 120);
  close(slices[0].complete.mediaGanhos, 31);
  const total = monthSummary(orders, null, "2026-11", new Date(2026, 10, 10));
  close(total.custoCompra, 48);
  close(total.frete, 15);
  close(total.alfandega, 0);
  close(
    slices.reduce((sum, slice) => sum + slice.summary.vendas, 0),
    total.vendas,
  );
  close(
    slices.reduce((sum, slice) => sum + slice.summary.custoCompra, 0),
    total.custoCompra,
  );
  close(
    slices.reduce((sum, slice) => sum + slice.summary.frete, 0),
    total.frete,
  );
  close(
    slices.reduce((sum, slice) => sum + slice.summary.resultado, 0),
    total.resultado,
  );
});
