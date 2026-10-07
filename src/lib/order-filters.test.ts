import assert from "node:assert/strict";
import test from "node:test";
import { ACCENTS, PLAIN, foldSearch, idPresence, likePattern, orderDigits } from "./order-filters.ts";

test("mapa de acentos tem o mesmo tamanho nos dois lados", () => {
  assert.equal(ACCENTS.length, PLAIN.length);
});

test("busca ignora acento e caixa", () => {
  assert.equal(foldSearch("Relógio"), "relogio");
  assert.equal(foldSearch("AÇÚCAR"), "acucar");
  assert.equal(likePattern("Relógio"), "%relogio%");
});

test("número do pedido fica só com os dígitos", () => {
  assert.equal(orderDigits("Pedido 26312"), "26312");
  assert.equal(orderDigits("26312"), "26312");
  assert.equal(orderDigits("orient"), "");
});

test("filtro de ID só aceita com ou sem", () => {
  assert.equal(idPresence("com"), "com");
  assert.equal(idPresence("sem"), "sem");
  assert.equal(idPresence("todos"), "");
  assert.equal(idPresence(undefined), "");
});
