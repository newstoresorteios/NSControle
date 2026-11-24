/**
 * Batch-refresh open Correios trackings via CWS API Rastro (not Portal Importador).
 *
 * Usage:
 *   node --env-file=.env.local scripts/correios-status-sync.mjs
 *   node --env-file=.env.local scripts/correios-status-sync.mjs --mock
 *   node --env-file=.env.local scripts/correios-status-sync.mjs --mock --apply
 *   node --env-file=.env.local scripts/correios-status-sync.mjs --limit 40
 *
 * Env (prefer CORREIOS_API_*):
 *   CORREIOS_API_URL, CORREIOS_API_USER, CORREIOS_API_TOKEN,
 *   CORREIOS_API_CARTAO?, CORREIOS_API_CONTRATO?, CORREIOS_API_DR?, CORREIOS_API_MOCK=1
 * Legacy: CORREIOS_USUARIO, CORREIOS_SENHA, CORREIOS_CARTAO
 *
 * --mock alone is dry-run (no DB writes). Pass --apply with --mock only on a disposable DB.
 */
import postgres from "postgres";

const BATCH = 20;
const args = new Set(process.argv.slice(2));
const mock = args.has("--mock") || process.env.CORREIOS_API_MOCK === "1";
const apply = args.has("--apply") || (!mock && process.env.CORREIOS_API_DRY_RUN !== "1");
const limitArg = process.argv.find((a, i, all) => all[i - 1] === "--limit");
const maxCodes = limitArg ? Math.max(1, Number(limitArg) || BATCH) : Infinity;

function env(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

const apiUrl = (env("CORREIOS_API_URL") || "https://api.correios.com.br").replace(/\/$/, "");
const usuario = env("CORREIOS_API_USER", "CORREIOS_API_USUARIO", "CORREIOS_USUARIO");
const senha = env("CORREIOS_API_TOKEN", "CORREIOS_API_SENHA", "CORREIOS_SENHA");
const cartao = env("CORREIOS_API_CARTAO", "CORREIOS_CARTAO");
const contrato = env("CORREIOS_API_CONTRATO", "CORREIOS_CONTRATO");
const dr = env("CORREIOS_API_DR", "CORREIOS_DR");

function fold(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function statusFromEvent(event) {
  const description = String(event?.descricao || "").trim();
  if (!description) return null;
  const detail = String(event?.detalhe || "").trim() || null;
  const phrase = fold(`${description} ${detail || ""}`);
  const raw = String(event?.dtHrCriado || "").trim();
  const stamped = raw && /[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw ? `${raw}-03:00` : "";
  const when = stamped ? new Date(stamped) : null;
  const tracking_event_at = when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
  const delivered = /\bentregue\b/.test(phrase) && !/nao entregue|tentativa/.test(phrase);
  let tracking_situation = "Em trânsito";
  if (delivered) tracking_situation = "Entregue";
  else if (/devolv/.test(phrase)) tracking_situation = "DEVOLUÇÃO";
  else if (/fiscal|aduane|alfandeg|tribut|desembara|despacho postal/.test(phrase)) tracking_situation = "Alfândega";
  else if (/avaria|extravi|roub|furt|apreend|sinistr/.test(phrase)) tracking_situation = "PROBLEMA";
  const extra = detail && fold(detail) !== fold(description) ? detail : null;
  return {
    tracking_correios: [description, extra].filter(Boolean).join(" · ").slice(0, 500),
    tracking_situation,
    tracking_event_at,
    delivered,
  };
}

async function getToken() {
  const path = cartao ? "/token/v1/autentica/cartaopostagem" : "/token/v1/autentica";
  const headers = {
    Authorization: `Basic ${Buffer.from(`${usuario}:${senha}`).toString("base64")}`,
    Accept: "application/json",
  };
  let body;
  if (cartao) {
    headers["Content-Type"] = "application/json";
    const payload = { numero: cartao };
    if (contrato) payload.contrato = contrato;
    if (dr && Number.isFinite(Number(dr))) payload.dr = Number(dr);
    body = JSON.stringify(payload);
  }
  const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    throw new Error(`token ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  return payload.token;
}

async function trackObjects(token, codes) {
  if (mock) {
    return codes.map((code) => ({
      code,
      event: {
        descricao: code.endsWith("BR") && code.includes("123")
          ? "Objeto entregue ao destinatário"
          : "Objeto em trânsito - por favor aguarde",
        dtHrCriado: new Date().toISOString().slice(0, 19),
      },
    }));
  }
  const url = new URL(`${apiUrl}/srorastro/v1/objetos`);
  for (const code of codes) url.searchParams.append("codigosObjetos", code);
  url.searchParams.set("resultado", "U");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`rastro ${response.status}`);
  const objects = Array.isArray(payload.objetos) ? payload.objetos : [];
  return objects.map((object) => {
    const code = String(object.codObjeto || "").trim().toUpperCase();
    const events = Array.isArray(object.eventos) ? object.eventos : [];
    const event = events.filter((e) => e?.descricao).sort((a, b) => String(b.dtHrCriado || "").localeCompare(String(a.dtHrCriado || "")))[0] || null;
    return { code, event };
  });
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}
if (!mock && (!usuario || !senha)) {
  console.error("Configure CORREIOS_API_USER + CORREIOS_API_TOKEN (ou --mock / CORREIOS_API_MOCK=1)");
  process.exit(1);
}

const sql = postgres(dbUrl, { ssl: "require", max: 1 });
const report = { checked: 0, updated: 0, missing: 0, delivered: 0 };

try {
  const token = mock ? "mock" : await getToken();
  let offset = 0;
  while (report.checked < maxCodes) {
    const take = Math.min(BATCH, maxCodes - report.checked);
    const rows = await sql`
      select tracking_code from (
        select upper(trim(tracking_code)) as tracking_code,
               min(tracking_event_at) as event_at
        from ctl_orders
        where delivered = false
          and tracking_code ~ '^[A-Za-z]{2}[0-9]{9}[A-Za-z]{2}$'
        group by 1
      ) codes
      order by event_at asc nulls first, tracking_code
      offset ${offset}
      limit ${take}
    `;
    if (!rows.length) break;
    const codes = rows.map((r) => r.tracking_code);
    report.checked += codes.length;
    const objects = await trackObjects(token, codes);
    for (const object of objects) {
      if (!object.code) continue;
      const status = statusFromEvent(object.event);
      if (!status?.tracking_event_at) {
        report.missing += 1;
        continue;
      }
      if (!apply) {
        report.updated += 1;
        if (status.delivered) report.delivered += 1;
        continue;
      }
      await sql`
        update ctl_orders
        set tracking_checked_at = now()
        where delivered = false and upper(trim(tracking_code)) = ${object.code}
      `;
      const updated = await sql`
        update ctl_orders set
          tracking_correios = ${status.tracking_correios},
          tracking_situation = ${status.tracking_situation},
          tracking_event_at = ${status.tracking_event_at},
          tracking_checked_at = now(),
          delivered = ${status.delivered},
          commercial_status = case
            when ${status.delivered}
              and upper(btrim(coalesce(commercial_status, ''))) not in ('CANCELADO', 'FINALIZADO', 'ENTREGUE')
            then 'ENTREGUE'
            else commercial_status
          end
        where delivered = false
          and upper(trim(tracking_code)) = ${object.code}
          and (tracking_event_at is null or tracking_event_at < ${status.tracking_event_at}::timestamptz)
      `;
      report.updated += updated.count;
      if (status.delivered && updated.count > 0) report.delivered += updated.count;
    }
    offset += codes.length;
    if (codes.length < take) break;
  }
  console.log(JSON.stringify({ ok: true, mock, apply, ...report }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), ...report }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
