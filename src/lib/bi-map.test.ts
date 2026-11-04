import assert from "node:assert/strict";
import test from "node:test";
import { applyBiDraft, draftFromBi, type BiOrder } from "./bi-map.ts";
import type { StoredOrder } from "./tray-map.ts";

const sale: BiOrder = {
  id: "26226",
  number: "26226",
  customerName: "Cliente",
  status: "order",
  date: "2026-09-30T03:00:00+00:00",
  total: 6136.99,
};

test("pedido do BI vira venda da loja no mês da emissão", () => {
  const draft = draftFromBi(sale, {
    number: "26226",
    shipmentStatus: "shipped",
    trackingCode: "AB123456789BR",
    shippingMethod: "Sedex",
    shippedAt: "2026-10-02",
  });
  assert.ok(draft);
  assert.equal(draft.order_key, "26226");
  assert.equal(draft.sale_amount, 6136.99);
  assert.equal(draft.finance_month, "2026-09-01");
  assert.equal(draft.commercial_status, "ENVIADO");
  assert.equal(draft.tracking_code, "AB123456789BR");
  const row = applyBiDraft(null, draft).row;
  assert.equal(row.data_source, "bi");
  assert.equal(row.purchase_amount, undefined);
});

test("pedido da loja 1490060 não reutiliza o número da loja 687890", () => {
  const draft = draftFromBi(
    { id: "1490060:479", number: "479", status: "order", date: "2026-11-04T03:00:00+00:00", total: 11800 },
    { id: "1490060:479", number: "479", shippingCost: 49.14, trackingCode: "AE090643831BR" },
  );
  assert.ok(draft);
  assert.equal(draft.order_key, "1490060:479");
  assert.equal(draft.label, "Pedido 479 · 1490060");
  assert.equal(draft.sale_amount, 11800);
  assert.equal(draft.finance_month, "2026-11-01");
  assert.equal(draft.shipping_cost, 49.14);
  assert.equal(draft.tracking_code, "AE090643831BR");
});

test("orçamento do BI não entra no controle", () => {
  assert.equal(draftFromBi({ ...sale, status: "quote" }), null);
});

test("cancelado zera a venda e não apaga o status comercial já preenchido quando o BI não manda um novo", () => {
  const draft = draftFromBi({ ...sale, status: "cancelled" });
  assert.ok(draft);
  assert.equal(draft.cancelled, true);
  assert.equal(draft.sale_amount, null);
  const existing: StoredOrder = {
    id: "abc",
    order_key: "26226",
    flow: "loja_nova",
    finance_month: "2026-09-01",
    label: "Pedido especial",
    origin: "Loja",
    product_name: "Relógio",
    reference: null,
    commercial_status: "A ENVIAR VINDI",
    sale_amount: 100,
    payment_date: null,
    purchase_date: "2026-09-12",
    tracking_code: null,
    delivered: false,
    data_source: "planilha",
    tray_modified_at: null,
  };
  const open = draftFromBi(sale);
  assert.ok(open);
  open.commercial_status = null;
  const kept = applyBiDraft(existing, open);
  assert.equal(kept.row.commercial_status, undefined);
  assert.equal(kept.row.sale_amount, 6136.99);
  assert.equal(kept.row.data_source, undefined);
  assert.equal(kept.row.purchase_date, undefined);
  assert.equal(kept.row.origin, undefined);
  assert.equal(kept.row.finance_month, undefined);
});
