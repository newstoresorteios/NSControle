export function refundTotal(
  rows: Array<{ done_date: string | null; amount: string | number | null }>,
  month: string,
): number {
  return rows.reduce((total, row) => {
    if (!row.done_date || row.done_date.slice(0, 7) !== month) return total;
    const amount = Number(row.amount);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}
