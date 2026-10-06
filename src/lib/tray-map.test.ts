import assert from "node:assert/strict";
import test from "node:test";
import {
  addIsoDays,
  buildTrayDraft,
  cancellationFromTray,
  isSameTrayVersion,
  mergeTrayOrder,
  orderIdFromEvent,
  orderListFilters,
  type StoredOrder,
} from "./tray-map.ts";

const paid = {
  order: {
    id: 1200,
    status: "A ENVIAR",
    status_group: "awaiting_shipment",
    total: "1500.50",
    date: "2026-10-03",
    payment_date: "2026-10-03",
    has_payment: true,
    modified: "2026-10-04 15:00:00",
    discount: "10.00",
    taxes: "0.00",
  },
  payment: { method: "Pix", has_payment: true, payment_date: "2026-10-03" },
  shipping: {
    shipment: "Sedex",
    shipment_value: "40.00",
    sending_code: "AB123456789BR",
    sending_date: "2026-10-05",
  },
  customer: { name: "Ana", phone: "21999999999" },
  address: { city: "Rio de Janeiro", state: "RJ" },
  products: [{ name: "Relógio", quantity: 1, price: "1500.50" }],
};

test("pedido pago da loja vira venda, rastreio e mês financeiro", () => {
  const draft = buildTrayDraft(paid);
  assert.ok(draft);
  assert.equal(draft.order_key, "1200");
  assert.equal(draft.flow, "loja_nova");
  assert.equal(draft.origin, "Loja");
  assert.equal(draft.sale_amount, 1500.5);
  assert.equal(draft.sale_explicit, true);
  assert.equal(draft.finance_month, "2026-10-01");
  assert.equal(draft.payment_date, "2026-10-03");
  assert.equal(draft.commercial_status, "A ENVIAR");
  assert.equal(draft.tracking_code, "AB123456789BR");
  assert.equal(draft.product_name, "Relógio");
  assert.equal(draft.delivered, false);
  assert.match(draft.notes_tray, /Pix/);
  assert.match(draft.notes_tray, /frete 40.00/);
  assert.doesNotMatch(draft.notes_tray, /impostos/);
  const inserted = mergeTrayOrder(null, draft).row;
  assert.equal(inserted.shipping_cost, undefined);
  assert.equal(inserted.purchase_amount, undefined);
  assert.equal(inserted.import_tax, undefined);
  assert.equal(inserted.sale_amount, 1500.5);
});

test("pedido sem pagamento não entra no financeiro", () => {
  const draft = buildTrayDraft({
    order: { id: "88", status: "AGUARDANDO PAGAMENTO", total: "900.00", date: "2026-10-01", has_payment: false },
    payment: { has_payment: false, method: "Pix" },
    products: [{ name: "Pulseira", quantity: 2 }],
  });
  assert.ok(draft);
  assert.equal(draft.sale_amount, null);
  assert.equal(draft.sale_explicit, true);
  assert.equal(draft.product_name, "2x Pulseira");
  assert.equal(draft.finance_month, "2026-10-01");
});

test("cancelamento zera a venda e gera estorno", () => {
  const draft = buildTrayDraft({
    order: { id: 50, status: "CANCELADO", total: "200.00", date: "2026-09-02", has_payment: true },
    payment: { has_payment: true, method: "Cartão", payment_date: "2026-09-02" },
    products: [{ name: "Caneta" }],
  });
  assert.ok(draft);
  assert.equal(draft.cancelled, true);
  assert.equal(draft.sale_amount, null);
  assert.equal(draft.delivered, false);
  const cancel = cancellationFromTray(draft, "order-id");
  assert.equal(cancel?.amount, 200);
  assert.equal(cancel?.order_key, "50");
  assert.equal(cancel?.model, "Caneta");
  assert.equal(cancel?.gateway, "Cartão");
});

test("atualização da loja não apaga custo nem origem já preenchidos", () => {
  const draft = buildTrayDraft(paid);
  assert.ok(draft);
  const existing: StoredOrder = {
    id: "abc",
    order_key: "1200",
    flow: "loja_nova",
    finance_month: "2026-09-01",
    label: "Pedido especial",
    origin: "Japão",
    product_name: null,
    reference: null,
    commercial_status: null,
    sale_amount: 100,
    payment_date: null,
    purchase_date: "2026-09-01",
    tracking_code: null,
    delivered: false,
    data_source: "planilha",
    tray_modified_at: null,
  };
  const merged = mergeTrayOrder(existing, draft);
  assert.equal(merged.mode, "update");
  assert.equal(merged.row.sale_amount, 1500.5);
  assert.equal(merged.row.origin, undefined);
  assert.equal(merged.row.label, undefined);
  assert.equal(merged.row.purchase_amount, undefined);
  assert.equal(merged.row.finance_month, undefined);
  assert.equal(merged.row.product_name, "Relógio");
  assert.equal(merged.row.purchase_date, undefined);
});

test("pedido já lido na mesma versão não precisa de nova consulta", () => {
  const draft = buildTrayDraft(paid);
  assert.ok(draft);
  assert.equal(isSameTrayVersion(draft.tray_modified_at, "2026-10-04 15:00:00"), true);
  assert.equal(isSameTrayVersion(draft.tray_modified_at, "2026-10-04 16:00:00"), false);
  assert.equal(isSameTrayVersion(null, "2026-10-04 15:00:00"), false);
});

test("filtros e eventos de pedido", () => {
  assert.deepEqual(orderListFilters({ backfillDone: false, watermark: null, today: "2026-10-05" }), {
    date: `${addIsoDays("2026-10-05", -120)},2026-10-05`,
  });
  assert.deepEqual(orderListFilters({ backfillDone: true, watermark: "2026-10-03", today: "2026-10-05" }), {
    lastModifiedStart: "2026-10-03",
  });
  assert.equal(orderIdFromEvent({ scope_name: "order", scope_id: "44" }), "44");
  assert.equal(orderIdFromEvent({ scope_name: "product", scope_id: "44" }), null);
});
