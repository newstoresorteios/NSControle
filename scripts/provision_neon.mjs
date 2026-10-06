import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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

async function allRows(client, table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function omit(row, keys) {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

async function insertBatches(sql, table, rows, columns) {
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200).map((row) => {
      const item = {};
      for (const column of columns) item[column] = row[column] ?? null;
      return item;
    });
    if (!batch.length) continue;
    await sql`insert into ${sql(table)} ${sql(batch, ...columns)} on conflict do nothing`;
  }
}

const env = envFile();
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });
await sql.file(new URL("./neon_schema.sql", import.meta.url));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const auth = await supabase.auth.signInWithPassword({
  email: env.CONTROLE_EMAIL,
  password: env.CONTROLE_PASSWORD,
});
if (auth.error) throw new Error(auth.error.message);

const orders = (await allRows(supabase, "ctl_orders")).map((row) => omit(row, ["gain_amount"]));
const goals = await allRows(supabase, "ctl_monthly_goals");
const inventory = await allRows(supabase, "ctl_inventory_items");
const tradeIns = await allRows(supabase, "ctl_trade_ins");
const cancellations = await allRows(supabase, "ctl_cancellations");
const members = await allRows(supabase, "ctl_team_members");

const orderColumns = Object.keys(orders[0] ?? {});
if (orderColumns.length) await insertBatches(sql, "ctl_orders", orders, orderColumns);
if (goals.length) await insertBatches(sql, "ctl_monthly_goals", goals, Object.keys(goals[0]));
if (inventory.length) await insertBatches(sql, "ctl_inventory_items", inventory, Object.keys(inventory[0]));
if (tradeIns.length) await insertBatches(sql, "ctl_trade_ins", tradeIns, Object.keys(tradeIns[0]));
if (cancellations.length) await insertBatches(sql, "ctl_cancellations", cancellations, Object.keys(cancellations[0]));
if (members.length) await insertBatches(sql, "ctl_team_members", members, Object.keys(members[0]));

const counts = await sql`
  select 'orders' as table, count(*)::int as n from ctl_orders
  union all select 'goals', count(*)::int from ctl_monthly_goals
  union all select 'inventory', count(*)::int from ctl_inventory_items
  union all select 'trade_ins', count(*)::int from ctl_trade_ins
  union all select 'cancellations', count(*)::int from ctl_cancellations
  union all select 'members', count(*)::int from ctl_team_members
`;
console.log(counts.map((row) => `${row.table}=${row.n}`).join(" "));
await sql.end();
