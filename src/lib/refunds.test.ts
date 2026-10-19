import assert from "node:assert/strict";
import test from "node:test";
import { refundTotal } from "./refunds.ts";

test("refunds count in the month of done_date, including month boundaries", () => {
  const rows = [
    { done_date: "2026-09-30", amount: "20" },
    { done_date: "2026-10-01", amount: "500" },
    { done_date: "2026-11-01", amount: "50" },
    { done_date: null, amount: "100" },
  ];
  assert.equal(refundTotal(rows, "2026-10"), 500);
  assert.equal(refundTotal(rows, "2026-09"), 20);
});
