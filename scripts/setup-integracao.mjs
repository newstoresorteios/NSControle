import postgres from 'postgres';

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connection) throw new Error('DATABASE_URL ausente. Execute com --env-file=.env.local.');
const sql = postgres(connection.replace(/([?&])channel_binding=[^&]*/g,'$1').replace(/[?&]$/,''), {ssl:'require',max:1,prepare:false});
try {
  await sql.file(new URL('./integracao_schema.sql',import.meta.url));
  await sql.file(new URL('./integracao_separate.sql',import.meta.url));
  const [result] = await sql`select count(*)::int as tables from information_schema.tables where table_schema='public' and table_name like 'ctl_integration_%'`;
  console.log(`Integração: ${result.tables} tabelas verificadas.`);
} finally { await sql.end(); }
