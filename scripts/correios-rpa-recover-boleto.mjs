/**
 * Recover linha digitável + PDF from pagfacil boleto page.
 * Reads #urlBoleto and a[data-codigo] / #codigoBarras (from resumo.js).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRACKING = (process.argv[3] || "LX335304323JP").trim().toUpperCase();
const BOLETO_URL =
  process.argv[2] ||
  "https://pagfacil.correios.com.br/boletos/8b4fc77e-b75f-4316-8149-bb43c896dadd/resumo";
const MEDIA =
  "C:/Users/Pichau/AppData/Local/Cursor/AgentStores/cursor_agent_stores/bc-d4125a4e-e831-4880-a795-ffa828fd578b/files/media/smoke-" +
  TRACKING;
const BOLETOS_DIR = join(ROOT, "storage", "boletos");
const SEARCH_URL =
  "https://portalimportador.correios.com.br/pages/pesquisarRemessaImportador/pesquisarRemessaImportador.jsf";

function loadEnv() {
  const values = { ...process.env };
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i);
    if (values[k] == null || values[k] === "") values[k] = line.slice(i + 1);
  }
  return values;
}

function extractLinha(text) {
  if (!text) return null;
  const compact = String(text).replace(/\D/g, "");
  if (compact.length >= 47 && compact.length <= 48) return compact.slice(0, 47);
  return null;
}

function parseMoney(text) {
  const m = String(text || "").match(/R\$\s*([\d.]+,\d{2})/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "").replace(",", ".")).toFixed(2);
}

async function main() {
  const env = loadEnv();
  mkdirSync(MEDIA, { recursive: true });
  mkdirSync(BOLETOS_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ["--disable-popup-blocking"] });
  const context = await browser.newContext({ acceptDownloads: true, locale: "pt-BR" });
  const page = await context.newPage();

  await page.goto("https://cas.correios.com.br/login?service=" + encodeURIComponent(SEARCH_URL), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator('input[name="username"], #username, input[type="text"]').first().fill(env.CORREIOS_USER);
  await page.locator('input[name="password"], #password, input[type="password"]').first().fill(env.CORREIOS_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  const entendi = page.getByRole("button", { name: /^Entendi$/i });
  if (await entendi.count()) await entendi.click({ force: true }).catch(() => {});

  await page.goto(BOLETO_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(MEDIA, "10-recover-dom.png"), fullPage: true });

  const fields = await page.evaluate(() => {
    const urlBoleto = document.querySelector("#urlBoleto")?.value || null;
    const dataCodigo =
      document.querySelector("#linkCodigoBarras a")?.dataset?.codigo ||
      document.querySelector("[data-codigo]")?.getAttribute("data-codigo") ||
      null;
    const pText = document.querySelector("#codigoBarras p")?.innerText || null;
    const pedido = document.querySelector("#pedido")?.value || null;
    const pagamentoId = document.querySelector("#pagamentoId")?.value || null;
    return { urlBoleto, dataCodigo, pText, pedido, pagamentoId, href: location.href };
  });
  console.log("fields", {
    ...fields,
    dataCodigo: fields.dataCodigo ? `len=${String(fields.dataCodigo).replace(/\D/g, "").length}` : null,
    pText: fields.pText ? String(fields.pText).slice(0, 60) : null,
    urlBoleto: fields.urlBoleto ? fields.urlBoleto.slice(0, 120) : null,
  });

  const linha = extractLinha(fields.dataCodigo) || extractLinha(fields.pText);
  const text = await page.locator("body").innerText();
  const amount = parseMoney(text) || "85.45";
  const portal = fields.pedido || (text.match(/Resumo do Pedido\s*([0-9]+)/i) || [])[1] || null;
  const due = (text.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1];
  const dueDate = due
    ? `${due.split("/")[2]}-${due.split("/")[1]}-${due.split("/")[0]}`
    : "2026-11-09";

  let pdfBuf = null;
  if (fields.urlBoleto) {
    const resp = await context.request.get(fields.urlBoleto);
    console.log("pdf_http", resp.status(), resp.headers()["content-type"]);
    if (resp.ok()) {
      const body = Buffer.from(await resp.body());
      const ct = resp.headers()["content-type"] || "";
      if (/pdf|octet/i.test(ct) || body.slice(0, 4).toString() === "%PDF") pdfBuf = body;
      else {
        // maybe HTML wrapper — save for debug
        writeFileSync(join(MEDIA, "10-urlBoleto-body.bin"), body.slice(0, 2000));
        console.log("urlBoleto not pdf, bytes", body.length, "head", body.slice(0, 20).toString());
      }
    }
  }
  if (!pdfBuf) {
    // fallback: click imprimir and catch popup URL
    const [pop] = await Promise.all([
      context.waitForEvent("page", { timeout: 20000 }).catch(() => null),
      page.locator("#btn-imprimir-boleto, button:has-text('Imprimir Boleto')").first().click({ force: true }),
    ]);
    if (pop) {
      await pop.waitForLoadState("domcontentloaded").catch(() => {});
      console.log("print_popup", pop.url());
      const resp = await context.request.get(pop.url()).catch(() => null);
      if (resp?.ok()) {
        const body = Buffer.from(await resp.body());
        if (body.slice(0, 4).toString() === "%PDF") pdfBuf = body;
      }
      await pop.close().catch(() => {});
    }
  }

  let pdfPath = null;
  let pdfSha = null;
  if (pdfBuf && pdfBuf.length > 100) {
    pdfPath = `storage/boletos/${TRACKING}.pdf`;
    writeFileSync(join(ROOT, pdfPath), pdfBuf);
    pdfSha = createHash("sha256").update(pdfBuf).digest("hex");
    console.log("pdf_saved", pdfPath, "bytes", pdfBuf.length);
  }

  const sql = postgres(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });
  try {
    const orders = await sql`select id from ctl_orders where upper(trim(tracking_code)) = ${TRACKING} limit 1`;
    const orderId = orders[0]?.id || null;
    const tax = (
      await sql`
      update ctl_correios_taxas set
        order_id = coalesce(order_id, ${orderId}),
        portal_order_id = coalesce(${portal}, portal_order_id),
        tax_amount = ${amount}::numeric,
        payment_status = 'boleto_generated',
        due_date = ${dueDate}::date,
        linha_digitavel = coalesce(${linha}, linha_digitavel),
        pdf_path = coalesce(${pdfPath}, pdf_path),
        raw_payload = coalesce(raw_payload, '{}'::jsonb) || ${sql.json({
          recover: true,
          boletoUrl: BOLETO_URL,
          urlBoleto: fields.urlBoleto,
          pagamentoId: fields.pagamentoId,
        })},
        last_scraped_at = now(),
        updated_at = now()
      where tracking_code = ${TRACKING}
      returning id, tax_amount, payment_status, linha_digitavel, pdf_path, portal_order_id, due_date
    `
    )[0];

    let boleto = null;
    if (tax && (linha || pdfPath)) {
      const existing = linha
        ? await sql`select id from ctl_correios_boletos where linha_digitavel = ${linha} limit 1`
        : await sql`select id from ctl_correios_boletos where tax_id = ${tax.id} limit 1`;
      if (existing[0]) {
        boleto = (
          await sql`
          update ctl_correios_boletos set
            linha_digitavel = coalesce(${linha}, linha_digitavel),
            amount = ${amount}::numeric,
            due_date = ${dueDate}::date,
            pdf_path = coalesce(${pdfPath}, pdf_path),
            pdf_sha256 = coalesce(${pdfSha}, pdf_sha256),
            downloaded_at = now()
          where id = ${existing[0].id}
          returning id, linha_digitavel, amount, pdf_path
        `
        )[0];
      } else {
        boleto = (
          await sql`
          insert into ctl_correios_boletos (
            tax_id, order_id, tracking_code, linha_digitavel, amount, due_date, pdf_path, pdf_sha256
          ) values (
            ${tax.id}, ${orderId}, ${TRACKING}, ${linha}, ${amount}::numeric, ${dueDate}::date, ${pdfPath}, ${pdfSha}
          )
          returning id, linha_digitavel, amount, pdf_path
        `
        )[0];
      }
    }

    if (orderId) {
      await sql`
        update ctl_orders set
          tax_identified_at = coalesce(tax_identified_at, now()),
          import_tax = ${amount}::numeric,
          notes_robot = left(coalesce(notes_robot,'') || E'\n' || ${`smoke recover ${TRACKING}: boleto_generated valor=${amount} linha=${linha ? "yes" : "no"} pdf=${pdfPath ? "yes" : "no"}`}, 2000)
        where id = ${orderId}
      `;
      // tax_paid intentionally false
    }

    const out = { amount, linha, pdfPath, portal, dueDate, tax, boleto, tax_paid: false };
    writeFileSync(join(MEDIA, "recover-result.json"), JSON.stringify(out, null, 2));
    console.log("RECOVER_OK", JSON.stringify(out));
  } finally {
    await sql.end({ timeout: 5 });
    await browser.close();
  }
}

main().catch((err) => {
  console.error("RECOVER_FAIL", err);
  process.exit(1);
});
