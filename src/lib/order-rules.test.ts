import assert from "node:assert/strict";
import test from "node:test";
import { nationalShipment, needsAna } from "./order-rules.ts";

test("envio nacional dispensa alfândega e a Ana", () => {
  assert.equal(nationalShipment({ origin: "Pronta entrega" }), true);
  assert.equal(nationalShipment({ origin: "Brasil" }), true);
  assert.equal(nationalShipment({ origin: "Europa", label: "Relógio pronta entrega" }), true);
  assert.equal(nationalShipment({ origin: "Europa" }), false);
  assert.equal(needsAna({ origin: "Pronta entrega", purchased: false }), false);
  assert.equal(needsAna({ origin: "Europa", purchased: true }), false);
  assert.equal(needsAna({ origin: "Europa", purchased: false, delivered: false }), true);
  assert.equal(needsAna({ origin: "Devolução" }), false);
});
