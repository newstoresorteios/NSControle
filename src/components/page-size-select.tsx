"use client";

const SIZES = [30, 50, 100, 200];

export function PageSizeSelect({ value }: { value: number }) {
  return (
    <select
      name="tamanho"
      defaultValue={String(value)}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {SIZES.map((size) => (
        <option key={size} value={size}>
          {size}
        </option>
      ))}
    </select>
  );
}
