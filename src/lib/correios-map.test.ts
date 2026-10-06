import assert from "node:assert/strict";
import test from "node:test";
import { latestEvent, statusFromEvent } from "./correios-map.ts";

const now = new Date("2026-10-06T15:00:00.000Z");

test("fiscalização aduaneira vira fila de alfândega", () => {
  const status = statusFromEvent(
    {
      descricao: "Objeto encaminhado para fiscalização aduaneira",
      dtHrCriado: "2026-10-06T09:00:00",
    },
    now,
  );
  assert.equal(status?.tracking_situation, "Alfândega");
  assert.equal(status?.delivered, false);
  assert.match(status?.tracking_correios || "", /fiscalização aduaneira/);
});

test("entrega marca o objeto como entregue", () => {
  const status = statusFromEvent(
    { descricao: "Objeto entregue ao destinatário", dtHrCriado: "2026-10-06T11:00:00" },
    now,
  );
  assert.equal(status?.tracking_situation, "Entregue");
  assert.equal(status?.delivered, true);
});

test("tentativa de entrega não conta como entregue", () => {
  const status = statusFromEvent(
    { descricao: "Tentativa de entrega não efetuada", dtHrCriado: "2026-10-06T11:00:00" },
    now,
  );
  assert.equal(status?.delivered, false);
  assert.notEqual(status?.tracking_situation, "Entregue");
});

test("devolução e problema entram nas filas", () => {
  assert.equal(
    statusFromEvent({ descricao: "Objeto devolvido ao remetente", dtHrCriado: "2026-10-05T11:00:00" }, now)
      ?.tracking_situation,
    "DEVOLUÇÃO",
  );
  assert.equal(
    statusFromEvent({ descricao: "Objeto com avaria", dtHrCriado: "2026-10-05T11:00:00" }, now)?.tracking_situation,
    "PROBLEMA",
  );
});

test("evento antigo sem fila vira sem retorno", () => {
  const status = statusFromEvent({ descricao: "Objeto em trânsito", dtHrCriado: "2026-09-01T10:00:00" }, now);
  assert.equal(status?.tracking_situation, "Sem retorno");
});

test("evento recente em trânsito não entra em alerta", () => {
  const status = statusFromEvent({ descricao: "Objeto em trânsito", dtHrCriado: "2026-10-05T10:00:00" }, now);
  assert.equal(status?.tracking_situation, "Em trânsito");
  assert.equal(status?.delivered, false);
});

test("último evento é o mais novo", () => {
  const event = latestEvent([
    { descricao: "Objeto postado", dtHrCriado: "2026-10-01T10:00:00" },
    { descricao: "Objeto em trânsito", dtHrCriado: "2026-10-04T10:00:00" },
  ]);
  assert.equal(event?.descricao, "Objeto em trânsito");
});
