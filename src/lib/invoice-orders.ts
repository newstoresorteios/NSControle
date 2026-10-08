import { db } from "@/lib/db";
import { searchKey, type OrderHit } from "@/lib/invoice-match";

type Row = {
  id: string;
  order_key: string;
  label: string | null;
  product_name: string | null;
  reference: string | null;
  supplier_ref: string | null;
  flow: string;
  purchased: boolean;
  updated_at: string | null;
};

export async function candidateOrders(
  lines: Array<{ kind: string; reference: string | null; orderKey: string | null }>,
): Promise<OrderHit[]> {
  const keys = [
    ...new Set(lines.map((line) => line.orderKey).filter((key): key is string => Boolean(key && /^\d+$/.test(key)))),
  ];
  const codes = [
    ...new Set(
      lines
        .filter((line) => line.kind === "produto" && line.reference)
        .map((line) => searchKey(line.reference as string))
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const sql = db();
  const found: Row[] = [];
  if (keys.length) {
    found.push(
      ...(await sql<Row[]>`
        select id, order_key, label, product_name, reference, supplier_ref, flow, purchased, updated_at
        from ctl_orders
        where order_key = any(${keys})
      `),
    );
  }
  if (codes.length) {
    found.push(
      ...(await sql<Row[]>`
        select id, order_key, label, product_name, reference, supplier_ref, flow, purchased, updated_at
        from ctl_orders
        where translate(
          upper(coalesce(reference, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(supplier_ref, '') || ' ' || coalesce(label, '')),
          ${" .-/_"},
          ''
        ) like any(${codes.map((code) => `%${code}%`)})
        order by purchased asc, updated_at desc nulls last
        limit 150
      `),
    );
  }
  const map = new Map<string, OrderHit>();
  for (const row of found) {
    map.set(row.id, {
      id: row.id,
      orderKey: row.order_key,
      label: row.label,
      productName: row.product_name,
      reference: row.reference,
      supplierRef: row.supplier_ref,
      flow: row.flow,
      purchased: row.purchased,
      updatedAt: row.updated_at,
    });
  }
  return [...map.values()];
}
