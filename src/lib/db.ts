import postgres from "postgres";

const globalForDb = globalThis as unknown as { controleSql?: ReturnType<typeof postgres> };

function connectionString() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) throw new Error("DATABASE_URL ausente");
  return raw.replace(/([?&])channel_binding=[^&]*/g, "$1").replace(/\?&/, "?").replace(/[?&]$/, "");
}

export function db() {
  if (!globalForDb.controleSql) {
    globalForDb.controleSql = postgres(connectionString(), {
      ssl: "require",
      max: 4,
      prepare: false,
      idle_timeout: 120,
      types: {
        date: {
          to: 1082,
          from: [1082],
          serialize: (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "")),
          parse: (value: string) => value,
        },
        timestamptz: {
          to: 1184,
          from: [1114, 1184],
          serialize: (value: unknown) => (value instanceof Date ? value.toISOString() : String(value ?? "")),
          parse: (value: string) => value,
        },
      },
    });
  }
  return globalForDb.controleSql;
}

export async function insertRow(table: string, row: Record<string, unknown>, returning = "id") {
  const keys = Object.keys(row).filter((key) => row[key] !== undefined);
  const sql = db();
  const rows = await sql`insert into ${sql(table)} ${sql(row, ...keys)} returning ${sql(returning)}`;
  return rows[0] as Record<string, unknown>;
}

export async function updateRow(table: string, row: Record<string, unknown>, column: string, value: string) {
  const keys = Object.keys(row).filter((key) => row[key] !== undefined);
  if (!keys.length) return;
  const sql = db();
  await sql`update ${sql(table)} set ${sql(row, ...keys)} where ${sql(column)} = ${value}`;
}
