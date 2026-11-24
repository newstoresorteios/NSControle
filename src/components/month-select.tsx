"use client";

import { monthLabel } from "@/lib/format";

export function MonthSelect({ months, value }: { months: string[]; value: string }) {
  return (
    <select
      name="month"
      defaultValue={value}
      aria-label="Mês"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {months.map((month) => (
        <option key={month} value={month}>
          {monthLabel(month)}
        </option>
      ))}
    </select>
  );
}
