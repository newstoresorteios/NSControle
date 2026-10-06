import { readFileSync } from "node:fs";
import postgres from "postgres";

function envFile() {
  const values = {};
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function rowsOf(items, columns) {
  return items.map((item) => {
    const row = {};
    for (const column of columns) row[column] = item[column] ?? null;
    return row;
  });
}

const ORDER_COLUMNS = [
  "id", "order_key", "label", "flow", "origin", "reference", "product_name", "commercial_status",
  "sourcing_status", "purchased", "cpf_linked", "tax_paid", "delivered", "tracking_code",
  "tracking_situation", "tracking_alert", "tracking_correios", "tracking_event_at", "purchase_date",
  "payment_date", "sale_amount", "purchase_amount", "payment_fee", "shipping_cost", "import_tax",
  "supplier_days", "supplier_ref", "notes_internal", "notes_robot", "notes_human", "finance_month",
  "finance_month_key",
];
const INVENTORY_COLUMNS = [
  "id", "purchased_at", "brand", "model", "origin", "tracking_code", "sale_price", "sale_price_note",
  "cost", "cost_note", "location", "notes", "status", "order_id",
];
const TRADE_COLUMNS = [
  "id", "client_name", "phone", "cpf", "code", "model", "condition", "address", "cost",
  "invoice_received", "delivered", "order_id", "inventory_item_id",
];
const CANCEL_COLUMNS = [
  "id", "order_id", "order_key", "model", "refund_method", "bank_details", "amount", "due_date",
  "done_date", "reason", "window_note", "status", "gateway",
];

const payload = JSON.parse(readFileSync(process.argv[2], "utf8"));
const orderIds = new Set(payload.orders.map((order) => order.id));
const inventoryIds = new Set(payload.inventory.map((item) => item.id));
for (const item of [...payload.inventory, ...payload.trade_ins, ...payload.cancellations]) {
  if (item.order_id && !orderIds.has(item.order_id)) item.order_id = null;
}
for (const item of payload.trade_ins) {
  if (item.inventory_item_id && !inventoryIds.has(item.inventory_item_id)) item.inventory_item_id = null;
}

const sql = postgres(envFile().DATABASE_URL, { ssl: "require", max: 1, prepare: false });

function blank(value) {
  return value == null || value === "";
}

function day(value) {
  if (blank(value)) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const report = await sql.begin(async (tx) => {
  const trayRows = await tx`
    select order_key, label, origin, product_name, reference, commercial_status, sale_amount,
           payment_date, purchase_date, finance_month, tracking_code, tracking_event_at, delivered,
           tray_modified_at, notes_tray, purchased, cpf_linked, tax_paid
    from ctl_orders
    where data_source = 'tray'
  `;
  await tx`delete from ctl_cancellations`;
  await tx`delete from ctl_trade_ins`;
  await tx`delete from ctl_inventory_items`;
  await tx`delete from ctl_orders`;
  await tx`delete from ctl_monthly_goals`;

  if (payload.goals.length) {
    await tx`insert into ctl_monthly_goals ${tx(rowsOf(payload.goals, ["month", "target_amount"]))} `;
  }
  for (let index = 0; index < payload.orders.length; index += 200) {
    const batch = rowsOf(payload.orders.slice(index, index + 200), ORDER_COLUMNS);
    await tx`insert into ctl_orders ${tx(batch, ...ORDER_COLUMNS)}`;
  }
  for (let index = 0; index < payload.inventory.length; index += 200) {
    const batch = rowsOf(payload.inventory.slice(index, index + 200), INVENTORY_COLUMNS);
    await tx`insert into ctl_inventory_items ${tx(batch, ...INVENTORY_COLUMNS)}`;
  }
  for (let index = 0; index < payload.trade_ins.length; index += 200) {
    const batch = rowsOf(payload.trade_ins.slice(index, index + 200), TRADE_COLUMNS);
    await tx`insert into ctl_trade_ins ${tx(batch, ...TRADE_COLUMNS)}`;
  }
  for (let index = 0; index < payload.cancellations.length; index += 200) {
    const batch = rowsOf(payload.cancellations.slice(index, index + 200), CANCEL_COLUMNS);
    await tx`insert into ctl_cancellations ${tx(batch, ...CANCEL_COLUMNS)}`;
  }

  let filled = 0;
  let kept = 0;
  for (const tray of trayRows) {
    const matches = await tx`
      select id, sale_amount, payment_date, purchase_date, finance_month, product_name, tracking_code
      from ctl_orders
      where order_key = ${tray.order_key}
      order by case flow when 'encomenda' then 0 when 'loja_nova' then 1 else 2 end,
               finance_month desc nulls last
      limit 1
    `;
    const current = matches[0];
    if (!current) {
      const month = day(tray.finance_month);
      await tx`
        insert into ctl_orders (
          order_key, label, flow, origin, product_name, reference, commercial_status, sale_amount,
          payment_date, purchase_date, finance_month, finance_month_key, tracking_code, tracking_event_at,
          delivered, purchased, cpf_linked, tax_paid, data_source, tray_modified_at, notes_tray
        ) values (
          ${tray.order_key}, ${tray.label}, 'loja_nova', ${tray.origin}, ${tray.product_name}, ${tray.reference},
          ${tray.commercial_status}, ${tray.sale_amount}, ${day(tray.payment_date)}, ${day(tray.purchase_date)},
          ${month}, ${month || "0001-01-01"}, ${tray.tracking_code}, ${tray.tracking_event_at},
          ${tray.delivered}, ${tray.purchased}, ${tray.cpf_linked}, ${tray.tax_paid}, 'tray',
          ${tray.tray_modified_at}, ${tray.notes_tray}
        )
      `;
      kept += 1;
      continue;
    }
    const month = blank(current.finance_month) ? day(tray.finance_month) : null;
    const sale = blank(current.sale_amount) ? tray.sale_amount : null;
    const payment = blank(current.payment_date) ? day(tray.payment_date) : null;
    const purchase = blank(current.purchase_date) ? day(tray.purchase_date) : null;
    const product = blank(current.product_name) ? tray.product_name : null;
    const tracking = blank(current.tracking_code) ? tray.tracking_code : null;
    await tx`
      update ctl_orders set
        tray_modified_at = ${tray.tray_modified_at},
        notes_tray = ${tray.notes_tray},
        sale_amount = coalesce(${sale}, sale_amount),
        payment_date = coalesce(${payment}::date, payment_date),
        purchase_date = coalesce(${purchase}::date, purchase_date),
        product_name = coalesce(${product}, product_name),
        tracking_code = coalesce(${tracking}, tracking_code),
        finance_month = coalesce(${month}::date, finance_month),
        finance_month_key = coalesce(${month}::date, finance_month_key)
      where id = ${current.id}
    `;
    if (sale != null || month != null) filled += 1;
  }

  const queues = await tx`
    select
      count(*) filter (where tracking_situation ilike '%DEVOLU%')::int as devolucao,
      count(*) filter (where tracking_situation ilike '%ALF%')::int as alfandega,
      count(*) filter (where tracking_situation ilike '%Sem retorno%')::int as sem_retorno,
      count(*) filter (where commercial_status = 'A ENVIAR VINDI')::int as vindi,
      count(*)::int as orders
    from ctl_orders
  `;
  const october = await tx`
    select flow, count(*)::int as n, coalesce(sum(sale_amount), 0)::float8 as sale
    from ctl_orders
    where finance_month = '2026-10-01'
    group by flow
    order by flow
  `;
  return { traySeen: trayRows.length, filled, kept, queues: queues[0], october };
});

console.log(JSON.stringify(report, null, 2));
await sql.end();
