import assert from "node:assert/strict";
import test from "node:test";
import { calendarDate, nonnegativeMoney, panelPath, pathWith, validUuid } from "./operational.ts";

test("calendarDate rejects impossible dates and accepts leap day", () => {
  assert.equal(calendarDate("2024-02-29"), "2024-02-29");
  assert.equal(calendarDate("2026-02-29"), null);
  assert.equal(calendarDate("2026-13-01"), null);
});

test("nonnegativeMoney distinguishes blank from invalid and preserves zero", () => {
  assert.deepEqual(nonnegativeMoney(""), { ok: true, value: null });
  assert.deepEqual(nonnegativeMoney("0"), { ok: true, value: 0 });
  assert.deepEqual(nonnegativeMoney("100,50"), { ok: true, value: 100.5 });
  assert.deepEqual(nonnegativeMoney("-1"), { ok: false, value: null });
  assert.deepEqual(nonnegativeMoney("abc"), { ok: false, value: null });
});

test("panelPath stays inside the chosen screen", () => {
  assert.equal(panelPath("/estoque?q=mido", "/estoque", "/estoque"), "/estoque?q=mido");
  assert.equal(panelPath("/pedidos?nome=royal+oak", "/pedidos", "/pedidos"), "/pedidos?nome=royal+oak");
  assert.equal(panelPath("https://exemplo.test/estoque", "/estoque", "/estoque"), "/estoque");
  assert.equal(panelPath("//estoque", "/estoque", "/estoque"), "/estoque");
  assert.equal(pathWith("/pedidos?aba=pedidos", "ok", "excluido"), "/pedidos?aba=pedidos&ok=excluido");
});

test("validUuid requires a complete UUID", () => {
  assert.equal(validUuid("a7471b75-28ef-41c1-b6cd-b8a572af2699"), true);
  assert.equal(validUuid("a7471b75-28ef-41c1-b6cd-b8a572af269"), false);
});
