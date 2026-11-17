import assert from "node:assert/strict";
import test from "node:test";
import { customsFromTemplate, suggestedParcelGrams } from "./integracao.ts";
import { parcelBody, type LabelInput } from "./sendcloud.ts";

test("packaging adds 200 g only between 600 and 800 g", () => {
  assert.equal(suggestedParcelGrams(700), 900);
  assert.equal(suggestedParcelGrams(600), 800);
  assert.equal(suggestedParcelGrams(500), 500);
  assert.equal(suggestedParcelGrams(0), null);
});

test("customs template keeps the model and appends the manual note", () => {
  const filled = customsFromTemplate("pulso", "caixa original");
  assert.equal(filled?.description, "Wrist watch — caixa original");
  assert.equal(filled?.hs, "910221");
  assert.equal(customsFromTemplate("outro", null), null);
});

test("Sendcloud parcel uses the sender id, the watch and the measured weight", () => {
  const input: LabelInput = {
    shipmentId: "11111111-1111-1111-1111-111111111111",
    orderKey: "507",
    recipient: { name: "Ana", address: "Rua A", number: "10", city: "São Paulo", state: "SP", postal_code: "01310-100", country: "BR", phone: "11999999999" },
    description: "Wrist watch",
    value: 1200,
    currency: "EUR",
    hsCode: "910221",
    originCountry: "CH",
    weightG: 900,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  };
  const body = parcelBody(input, 192, "correos:express");
  assert.equal(body.from_address.sender_address_id, 192);
  assert.equal(body.ship_with.properties.shipping_option_code, "correos:express");
  assert.equal(body.parcels[0].weight.value, "0.900");
  assert.equal(body.parcels[0].parcel_items[0].hs_code, "910221");
  assert.equal(body.to_address.state_province_code, "BR-SP");
});
