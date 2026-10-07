import { readFileSync } from "node:fs";
import postgres from "postgres";

function envValue(name) {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(`${name}=`)) continue;
    let value = line.slice(name.length + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

const raw = envValue("DATABASE_URL") || envValue("POSTGRES_URL");
if (!raw) throw new Error("DATABASE_URL ausente");
const url = raw.replace(/([?&])channel_binding=[^&]*/g, "$1").replace(/\?&/, "?").replace(/[?&]$/, "");
const sql = postgres(url, { ssl: "require", max: 1, prepare: false });

const statements = readFileSync(new URL("../supabase/migrations/20261006235000_orders_read_indexes.sql", import.meta.url), "utf8")
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean);

try {
  for (const statement of statements) {
    const start = performance.now();
    await sql.unsafe(statement);
    console.log(`index_ms ${Math.round(performance.now() - start)}`);
  }

  const pageStart = performance.now();
  const rows = await sql`
    select id
    from ctl_orders
    where delivered = false
      and (origin is not null or tray_modified_at is not null)
    order by
      case when order_key ~ '^[0-9]+$' then 0 else 1 end,
      case when order_key ~ '^[0-9]+$' then order_key::numeric end desc nulls last,
      coalesce(label, order_key)
    limit 30
  `;
  const countStart = performance.now();
  const counted = await sql`
    select count(*)::int as total_count
    from ctl_orders
    where delivered = false
      and (origin is not null or tray_modified_at is not null)
  `;
  const countMs = Math.round(performance.now() - countStart);
  console.log(`page_ms ${Math.round(countStart - pageStart)} rows ${rows.length}`);
  console.log(`count_ms ${countMs} total ${counted[0]?.total_count ?? 0}`);

  const plan = await sql`
    explain
    select id
    from ctl_orders
    where delivered = false
      and (origin is not null or tray_modified_at is not null)
    order by
      case when order_key ~ '^[0-9]+$' then 0 else 1 end,
      case when order_key ~ '^[0-9]+$' then order_key::numeric end desc nulls last,
      coalesce(label, order_key)
    limit 30
  `;
  for (const row of plan) console.log(row["QUERY PLAN"]);
} finally {
  await sql.end({ timeout: 5 });
}
