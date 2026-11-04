/**
 * One-shot smoke: Portal Importador → tracking → boleto → Neon upsert.
 * Usage: node --env-file=.env.local scripts/correios-rpa-smoke.mjs [TRACKING]
 * Never logs CORREIOS_PASSWORD. Does not set tax_paid=true on boleto generation.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRACKING = (process.argv[2] || "LX335304323JP").trim().toUpperCase();
const SEARCH_URL =
  "https://portalimportador.correios.com.br/pages/pesquisarRemessaImportador/pesquisarRemessaImportador.jsf";
const MEDIA =
  process.env.SMOKE_MEDIA_DIR ||
  "C:/Users/Pichau/AppData/Local/Cursor/AgentStores/cursor_agent_stores/bc-d4125a4e-e831-4880-a795-ffa828fd578b/files/media/smoke-" +
    TRACKING;
const BOLETOS_DIR = join(ROOT, "storage", "boletos");
const HEADED = process.env.HEADED !== "0";

function loadEnv() {
  const values = { ...process.env };
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i);
      if (values[k] == null || values[k] === "") values[k] = line.slice(i + 1);
    }
  } catch {
    /* ignore */
  }
  return values;
}

function parseMoney(text) {
  if (!text) return null;
  const m = String(text).replace(/\s/g, "").match(/R\$\s*([\d.]+,\d{2}|[\d]+(?:\.\d{2})?)/i)
    || String(text).match(/([\d.]+,\d{2})/);
  if (!m) return null;
  const raw = m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1];
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

async function readValorAPagar(page) {
  // Prefer labeled value / input — ignore "Simulação IBS/CBS"
  const byLabel = page.getByLabel(/Valor a Pagar/i);
  if (await byLabel.count()) {
    const v = (await byLabel.inputValue().catch(() => "")) || (await byLabel.innerText().catch(() => ""));
    const parsed = parseMoney(v) || parseMoney("R$ " + v);
    if (parsed) return parsed;
  }
  const inputNear = page.locator("xpath=//*[contains(.,'Valor a Pagar')]/following::input[1]");
  if (await inputNear.count()) {
    const v = await inputNear.first().inputValue().catch(() => "");
    const parsed = parseMoney(v) || parseMoney("R$ " + v);
    if (parsed) return parsed;
  }
  const block = page.locator("text=Valor a Pagar").locator("xpath=ancestor::*[self::div or self::td or self::tr][1]");
  if (await block.count()) {
    const t = await block.first().innerText().catch(() => "");
    // strip simulation lines then parse
    const cleaned = t.replace(/Simula[cç][aã]o[\s\S]*/i, "");
    const parsed = parseMoney(cleaned);
    if (parsed) return parsed;
  }
  const body = await page.locator("body").innerText();
  const m = body.match(/Valor a Pagar[:\s]*R\$\s*([\d.]+,\d{2})/i);
  if (m) return parseMoney("R$ " + m[1]);
  return null;
}

async function waitAguardeGone(page, ms = 60000) {
  const aguarde = page.locator("text=Aguarde").first();
  try {
    await aguarde.waitFor({ state: "hidden", timeout: ms });
  } catch {
    /* may never appear */
  }
  await page.locator(".ui-dialog:visible, .ui-widget-overlay:visible").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
}

function extractLinha(text) {
  if (!text) return null;
  const digits = String(text).replace(/\D/g, " ");
  const m = digits.match(/\b(\d{47,48})\b/) || String(text).replace(/\s/g, "").match(/(\d{47,48})/);
  return m ? m[1] : null;
}

async function shot(page, name) {
  mkdirSync(MEDIA, { recursive: true });
  const path = join(MEDIA, name);
  await page.screenshot({ path, fullPage: true });
  console.log("screenshot:", path);
  return path;
}

async function upsertDb(env, payload) {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");
  const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
  try {
    const orders = await sql`
      select id, order_key, label, tracking_code, import_tax, tax_paid
      from ctl_orders
      where upper(trim(tracking_code)) = ${TRACKING}
      limit 2
    `;
    const order = orders[0] || null;
    const run = await sql`
      insert into ctl_correios_scrape_runs (status, items_seen, items_upserted, boletos_saved, error_summary, finished_at)
      values (
        ${payload.ok ? "success" : "partial"},
        1,
        ${payload.taxAmount ? 1 : 0},
        ${payload.pdfPath ? 1 : 0},
        ${payload.error || null},
        now()
      )
      returning id
    `;
    const runId = run[0].id;

    const status = payload.paymentStatus || (payload.pdfPath || payload.linha ? "boleto_generated" : "awaiting_payment");

    const taxRows = await sql`
      insert into ctl_correios_taxas (
        order_id, tracking_code, portal_order_id, tax_amount, payment_status,
        due_date, linha_digitavel, pdf_path, raw_payload, scrape_run_id, last_scraped_at
      ) values (
        ${order?.id ?? null},
        ${TRACKING},
        ${payload.portalOrderId || null},
        ${payload.taxAmount},
        ${status},
        ${payload.dueDate || null},
        ${payload.linha || null},
        ${payload.pdfPath || null},
        ${sql.json(payload.raw || {})},
        ${runId},
        now()
      )
      on conflict (tracking_code) do update set
        order_id = coalesce(excluded.order_id, ctl_correios_taxas.order_id),
        portal_order_id = coalesce(excluded.portal_order_id, ctl_correios_taxas.portal_order_id),
        tax_amount = coalesce(excluded.tax_amount, ctl_correios_taxas.tax_amount),
        payment_status = excluded.payment_status,
        due_date = coalesce(excluded.due_date, ctl_correios_taxas.due_date),
        linha_digitavel = coalesce(excluded.linha_digitavel, ctl_correios_taxas.linha_digitavel),
        pdf_path = coalesce(excluded.pdf_path, ctl_correios_taxas.pdf_path),
        raw_payload = coalesce(ctl_correios_taxas.raw_payload, '{}'::jsonb) || excluded.raw_payload,
        scrape_run_id = excluded.scrape_run_id,
        last_scraped_at = now(),
        updated_at = now()
      returning id, order_id, tracking_code, tax_amount, payment_status, linha_digitavel, pdf_path
    `;
    const tax = taxRows[0];

    let boleto = null;
    if (payload.linha || payload.pdfPath) {
      const existing = payload.linha
        ? await sql`select id from ctl_correios_boletos where linha_digitavel = ${payload.linha} limit 1`
        : [];
      if (existing[0]) {
        boleto = (
          await sql`
            update ctl_correios_boletos set
              tax_id = ${tax.id},
              order_id = coalesce(${order?.id ?? null}, order_id),
              amount = coalesce(${payload.taxAmount}, amount),
              pdf_path = coalesce(${payload.pdfPath || null}, pdf_path),
              pdf_sha256 = coalesce(${payload.pdfSha || null}, pdf_sha256),
              downloaded_at = now()
            where id = ${existing[0].id}
            returning id, tax_id, order_id, linha_digitavel, amount, pdf_path
          `
        )[0];
      } else {
        boleto = (
          await sql`
            insert into ctl_correios_boletos (
              tax_id, order_id, tracking_code, linha_digitavel, amount, due_date, pdf_path, pdf_sha256
            ) values (
              ${tax.id}, ${order?.id ?? null}, ${TRACKING}, ${payload.linha || null},
              ${payload.taxAmount}, ${payload.dueDate || null}, ${payload.pdfPath || null}, ${payload.pdfSha || null}
            )
            returning id, tax_id, order_id, linha_digitavel, amount, pdf_path
          `
        )[0];
      }
    }

    if (order && payload.taxAmount) {
      await sql`
        update ctl_orders set
          tax_identified_at = coalesce(tax_identified_at, now()),
          import_tax = ${payload.taxAmount},
          notes_robot = case
            when notes_robot is null or notes_robot = '' then ${payload.note}
            when notes_robot like ${"%" + payload.note + "%"} then notes_robot
            else left(notes_robot || E'\n' || ${payload.note}, 2000)
          end
        where id = ${order.id}
      `;
      // intentionally NOT setting tax_paid=true for boleto_generated
    }

    return { order, tax, boleto, runId };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const env = loadEnv();
  const user = env.CORREIOS_USER;
  const pass = env.CORREIOS_PASSWORD;
  if (!user || !pass) {
    console.error("FAIL: CORREIOS_USER / CORREIOS_PASSWORD missing in env");
    process.exit(2);
  }
  console.log("tracking:", TRACKING);
  console.log("user_set: yes len=" + user.length);
  console.log("headed:", HEADED);
  mkdirSync(BOLETOS_DIR, { recursive: true });
  mkdirSync(MEDIA, { recursive: true });

  const result = {
    ok: false,
    taxAmount: null,
    linha: null,
    pdfPath: null,
    pdfSha: null,
    portalOrderId: null,
    dueDate: null,
    paymentStatus: "error",
    error: null,
    note: `smoke ${TRACKING} ${new Date().toISOString().slice(0, 10)}`,
    raw: {},
  };

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ["--disable-popup-blocking"],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: "pt-BR",
    viewport: { width: 1400, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // pagfacil may open as cross-origin popup
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await context.newPage();

  try {
    // Login via CAS service URL (from planilha Logins)
    const loginUrl =
      "https://cas.correios.com.br/login?service=" +
      encodeURIComponent(SEARCH_URL);
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await shot(page, "01-login.png");

    // Fill username/password — Correios CAS fields vary
    const userSel = [
      'input[name="username"]',
      "#username",
      'input[type="text"]',
      'input[name="usuario"]',
    ];
    const passSel = [
      'input[name="password"]',
      "#password",
      'input[type="password"]',
    ];
    let filled = false;
    for (const us of userSel) {
      const el = page.locator(us).first();
      if (await el.count()) {
        await el.fill(user);
        filled = true;
        break;
      }
    }
    if (!filled) throw new Error("username field not found");
    let passFilled = false;
    for (const ps of passSel) {
      const el = page.locator(ps).first();
      if (await el.count()) {
        await el.fill(pass);
        passFilled = true;
        break;
      }
    }
    if (!passFilled) throw new Error("password field not found");

    // Submit
    const submit = page.locator(
      'button[type="submit"], input[type="submit"], button:has-text("LOGIN"), button:has-text("Entrar"), input[value*="LOGIN" i]',
    ).first();
    await submit.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "02-after-login.png");

    // CAPTCHA / failure detection
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/captcha|recaptcha|desafio|código de segurança/i.test(bodyText) && /password|senha|login/i.test(bodyText)) {
      result.error = "CAPTCHA or login challenge detected";
      result.raw.blocker = "captcha";
      await shot(page, "02b-captcha.png");
      throw new Error(result.error);
    }
    if (/usu[aá]rio ou senha inv[aá]lid|authentication failed|credenciais/i.test(bodyText) && page.url().includes("login")) {
      result.error = "login failed (invalid credentials?)";
      throw new Error(result.error);
    }

    // Ensure on search page
    if (!page.url().includes("pesquisarRemessaImportador")) {
      await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
    }

    // Dismiss "NOTÍCIA IMPORTANTE" / Entendi modal if present
    for (let i = 0; i < 3; i++) {
      const entendi = page.getByRole("button", { name: /^Entendi$/i })
        .or(page.locator('button:has-text("Entendi"), input[value="Entendi"], a:has-text("Entendi")'))
        .first();
      if (await entendi.count()) {
        const visible = await entendi.isVisible().catch(() => false);
        if (visible) {
          await entendi.click({ force: true });
          await page.waitForTimeout(800);
          console.log("dismissed modal: Entendi");
        } else break;
      } else break;
    }
    // Also close any dialog overlay via Escape
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, "03-search-page.png");

    // Fill tracking search — visible text input under Pesquisar Encomenda
    const labeled = page.getByLabel(/c[oó]digo da encomenda/i);
    if (await labeled.count()) {
      await labeled.fill(TRACKING);
    } else {
      const boxes = page.locator('input[type="text"]:visible');
      const n = await boxes.count();
      let done = false;
      for (let i = 0; i < n; i++) {
        const box = boxes.nth(i);
        const meta =
          ((await box.getAttribute("placeholder")) || "") +
          ((await box.getAttribute("id")) || "") +
          ((await box.getAttribute("name")) || "");
        if (/encomenda|objeto|rastre|codigo|código|remessa/i.test(meta) || (n === 1 && i === 0)) {
          await box.fill(TRACKING);
          done = true;
          if (/encomenda|objeto|rastre|remessa/i.test(meta)) break;
        }
      }
      if (!done && n > 0) await boxes.first().fill(TRACKING);
      if (!done && n === 0) throw new Error("tracking input not found");
    }

    // Click visible Pesquisar button (avoid hidden JSF form field)
    const searchBtn = page.locator('input[type="submit"][value*="Pesquisar" i]:visible, button:visible:has-text("Pesquisar")').first();
    if (await searchBtn.count()) {
      await searchBtn.click();
    } else {
      // PrimeFaces / JSF often uses <button> or <a> styled as button
      const alt = page.locator("text=Pesquisar").locator("xpath=ancestor-or-self::*[self::button or self::a or self::span][1]").first();
      await alt.click({ force: true });
    }
    await page.waitForTimeout(2500);
    await shot(page, "04-search-result.png");

    const resultText = await page.locator("body").innerText();
    result.raw.searchSnippet = resultText.slice(0, 1500);

    if (!/Aguardando Pagamento/i.test(resultText)) {
      result.paymentStatus = /pago|pago|quitad/i.test(resultText)
        ? "paid"
        : /n[aã]o encontr|sem registro|nenhum registro/i.test(resultText)
          ? "not_found"
          : "no_action";
      result.error = `situation not Aguardando Pagamento (status=${result.paymentStatus})`;
      result.ok = result.paymentStatus !== "error";
      // still try to capture any valor on page
      result.taxAmount = parseMoney(resultText);
      const db = await upsertDb(env, result);
      console.log("DB:", JSON.stringify(db, null, 2));
      console.log("RESULT:", JSON.stringify({ ...result, pass: undefined }, null, 2));
      return;
    }

    result.paymentStatus = "awaiting_payment";

    // Click $ payment icon inside the result row for this tracking (avoid dialog chrome)
    const row = page.locator("table tbody tr, tr").filter({ hasText: TRACKING }).first();
    if (!(await row.count())) throw new Error("result row not found for tracking");
    await row.scrollIntoViewIfNeeded().catch(() => {});

    let clickedPay = false;
    const payInRow = row.locator(
      'a[title*="pagament" i], a[aria-label*="pagament" i], a[title*="$"], button[title*="pagament" i], img[title*="pagament" i], img[alt*="pagament" i], a[onclick*="pagament" i]',
    );
    if (await payInRow.count()) {
      await payInRow.first().click({ force: true });
      clickedPay = true;
    }
    if (!clickedPay) {
      // PrimeFaces command links in Ação: usually menu, eye, $ — pick last clickable in first cell
      const actionCell = row.locator("td").first();
      const clickables = actionCell.locator("a:visible, button:visible, span.ui-button:visible");
      const lc = await clickables.count();
      console.log("action_clickables:", lc);
      for (let i = 0; i < lc; i++) {
        const el = clickables.nth(i);
        const meta =
          ((await el.getAttribute("title")) || "") +
          ((await el.getAttribute("aria-label")) || "") +
          ((await el.innerText().catch(() => "")) || "");
        if (/\$|pagament|boleto|pagar/i.test(meta)) {
          await el.click({ force: true });
          clickedPay = true;
          break;
        }
      }
      if (!clickedPay && lc >= 3) {
        await clickables.nth(2).click({ force: true });
        clickedPay = true;
      } else if (!clickedPay && lc >= 1) {
        await clickables.nth(lc - 1).click({ force: true });
        clickedPay = true;
      }
    }
    if (!clickedPay) throw new Error("payment ($) action not found in row");

    await page.waitForTimeout(1500);
    // Portal may show "Pagamento em Processamento" if boleto already issued
    const procModal = page.getByText(/Pagamento em Processamento/i);
    if (await procModal.count()) {
      await shot(page, "05-pagamento-em-processamento.png");
      result.paymentStatus = "boleto_generated";
      result.error = "Pagamento em Processamento — boleto already issued; PDF/linha may need pagfacil recover";
      result.ok = true;
      result.note = `smoke ${TRACKING}: payment already processing`;
      const fechar = page.getByRole("button", { name: /^Fechar$/i });
      if (await fechar.count()) await fechar.click({ force: true }).catch(() => {});
      const db = await upsertDb(env, result);
      console.log("DB:", JSON.stringify(db, null, 2));
      console.log("SMOKE_PARTIAL_PROCESSING", JSON.stringify({ tracking: TRACKING, orderId: db.order?.id }));
      return;
    }

    await waitAguardeGone(page, 30000);
    await page.waitForTimeout(1500);
    await shot(page, "05-efetuar-pagamento.png");

    // Checkbox ciência (must enable Concluir pagamento)
    const ciencia = page.locator('input[type="checkbox"]').filter({ has: page.locator("xpath=..") }).first();
    const checkboxes = page.locator('input[type="checkbox"]:visible');
    if (await checkboxes.count()) {
      const box = checkboxes.first();
      if (!(await box.isChecked())) {
        await box.check({ force: true }).catch(async () => {
          await page.locator("label").filter({ hasText: /Estou ciente/i }).click({ force: true });
        });
      }
    } else {
      await page.getByText(/Estou ciente/i).click({ force: true }).catch(() => {});
    }
    await waitAguardeGone(page, 30000);
    await page.waitForTimeout(1000);

    result.taxAmount = await readValorAPagar(page);
    const payPageText = await page.locator("body").innerText();
    result.raw.paySnippet = payPageText.slice(0, 2000);
    console.log("valor_a_pagar:", result.taxAmount);

    // Concluir pagamento → formas de pagamento
    const concluir = page.getByRole("button", { name: /Concluir pagamento/i })
      .or(page.locator('button:has-text("Concluir pagamento"), input[value*="Concluir pagamento" i], a:has-text("Concluir pagamento")'))
      .first();
    if (!(await concluir.count()) || !(await concluir.isVisible().catch(() => false))) {
      // checkbox may still be blocking — click label then retry
      await page.locator("label").filter({ hasText: /Estou ciente/i }).click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    }
    await concluir.click({ timeout: 15000 });
    await waitAguardeGone(page, 60000);
    await page.waitForTimeout(2000);
    await shot(page, "06-forma-pagamento.png");

    // Choose Boleto Bancário on "Como você prefere pagar?"
    const boletoCard = page.locator("div, button, a, label, li").filter({ hasText: /^Boleto Banc[aá]rio/i }).first();
    const boletoText = page.getByText(/Boleto Banc[aá]rio/i).first();
    if (await page.getByText(/Como você prefere pagar/i).count()) {
      console.log("on payment method page");
    }
    if (await boletoCard.count()) {
      await boletoCard.click({ force: true });
    } else if (await boletoText.count()) {
      await boletoText.click({ force: true });
    } else {
      result.error = "Boleto Bancário option not found (still on efetuar pagamento?)";
      await shot(page, "06b-no-boleto.png");
      // still persist valor if we have it
      if (result.taxAmount) {
        result.paymentStatus = "awaiting_payment";
        result.ok = true;
        const db = await upsertDb(env, result);
        console.log("DB:", JSON.stringify(db, null, 2));
      }
      throw new Error(result.error);
    }
    await page.waitForTimeout(1500);
    await shot(page, "07-boleto-selected.png");

    // Confirm modal "Deseja Pagar com Boleto?" → Pagar (may navigate to pagfacil)
    const popupPromise = context.waitForEvent("page", { timeout: 45000 }).catch(() => null);
    const pagarModal = page.getByRole("button", { name: /^Pagar$/i })
      .or(page.locator('.ui-dialog button:has-text("Pagar"), button:has-text("Pagar")'))
      .first();
    if (await pagarModal.count()) {
      await pagarModal.click({ force: true });
      console.log("clicked modal Pagar");
    }
    let boletoPage = page;
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => {});
      boletoPage = popup;
      console.log("boleto popup url:", popup.url());
    } else {
      await page.waitForTimeout(2500);
      // maybe same-tab navigation to pagfacil
      if (/pagfacil|boleto/i.test(page.url())) {
        console.log("boleto same-tab url:", page.url());
      }
    }
    await waitAguardeGone(boletoPage, 30000);
    await boletoPage.waitForTimeout(1500);
    await boletoPage.screenshot({ path: join(MEDIA, "08-after-boleto.png"), fullPage: true }).catch(() => {});
    console.log("screenshot:", join(MEDIA, "08-after-boleto.png"));

    const afterText = await boletoPage.locator("body").innerText().catch(() => "");
    result.raw.afterSnippet = afterText.slice(0, 2000);
    result.raw.finalUrl = boletoPage.url();
    result.taxAmount = result.taxAmount || parseMoney(afterText);
    const portalMatch =
      afterText.match(/Resumo do Pedido\s*([0-9]+)/i) ||
      afterText.match(/Pedido\s+([0-9]{10,})/i);
    if (portalMatch) result.portalOrderId = portalMatch[1];
    const dueMatch = afterText.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) {
      const [d, m, y] = dueMatch[1].split("/");
      result.dueDate = `${y}-${m}-${d}`;
    }

    // Copiar código de barras → clipboard linha digitável
    const copiar = boletoPage.getByText(/Copiar c[oó]digo de barras/i).first();
    if (await copiar.count()) {
      await copiar.click({ force: true });
      await boletoPage.waitForTimeout(500);
      const clip = await boletoPage.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return "";
        }
      }).catch(() => "");
      result.linha = extractLinha(clip) || extractLinha(clip.replace(/\s/g, "")) || result.linha;
      console.log("linha_from_clipboard:", result.linha ? `len=${result.linha.length}` : "none");
    }
    result.linha = result.linha || extractLinha(afterText);

    // Imprimir Boleto → PDF download
    let pdfBuf = null;
    const pdfName = `${TRACKING}.pdf`;
    const imprimir = boletoPage.getByRole("button", { name: /Imprimir Boleto/i })
      .or(boletoPage.locator('button:has-text("Imprimir Boleto"), a:has-text("Imprimir Boleto")'))
      .first();
    if (await imprimir.count()) {
      const [dl] = await Promise.all([
        boletoPage.waitForEvent("download", { timeout: 45000 }).catch(() => null),
        imprimir.click({ force: true }),
      ]);
      if (dl) {
        const tmp = join(BOLETOS_DIR, `_tmp_${TRACKING}`);
        await dl.saveAs(tmp);
        pdfBuf = readFileSync(tmp);
        try {
          const { unlinkSync } = await import("node:fs");
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      } else {
        // popup PDF window
        const pdfPopup = await context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
        if (pdfPopup) {
          await pdfPopup.waitForLoadState("domcontentloaded").catch(() => {});
          await pdfPopup.screenshot({ path: join(MEDIA, "08c-pdf-popup.png"), fullPage: true }).catch(() => {});
          const resp = await pdfPopup.request.get(pdfPopup.url()).catch(() => null);
          if (resp && resp.ok()) pdfBuf = Buffer.from(await resp.body());
          await pdfPopup.close().catch(() => {});
        }
      }
    }

    // Fallback: any pdf link
    if (!pdfBuf) {
      const pdfLink = boletoPage.locator('a[href*=".pdf" i], a:has-text("PDF"), a:has-text("DIT")').first();
      if (await pdfLink.count()) {
        const [dl] = await Promise.all([
          boletoPage.waitForEvent("download", { timeout: 20000 }).catch(() => null),
          pdfLink.click({ force: true }),
        ]);
        if (dl) {
          const tmp = join(BOLETOS_DIR, `_tmp2_${TRACKING}`);
          await dl.saveAs(tmp);
          pdfBuf = readFileSync(tmp);
        }
      }
    }

    if (pdfBuf && pdfBuf.length > 100) {
      const outPath = join(BOLETOS_DIR, pdfName);
      writeFileSync(outPath, pdfBuf);
      result.pdfPath = `storage/boletos/${pdfName}`;
      result.pdfSha = createHash("sha256").update(pdfBuf).digest("hex");
      // try extract linha from pdf text via strings
      const asText = pdfBuf.toString("latin1");
      result.linha = result.linha || extractLinha(asText);
      console.log("pdf_saved:", outPath, "bytes=", pdfBuf.length);
    } else {
      console.log("pdf: not downloaded");
    }

    result.paymentStatus = result.pdfPath || result.linha ? "boleto_generated" : "awaiting_payment";
    result.ok = Boolean(result.taxAmount);
    result.note = `smoke ${TRACKING}: valor=${result.taxAmount || "?"} status=${result.paymentStatus} boleto=${result.pdfPath ? "yes" : "no"}`;
    result.raw.finalUrl = page.url();

    const db = await upsertDb(env, result);
    writeFileSync(join(MEDIA, "result.json"), JSON.stringify({ result, db }, null, 2));
    console.log("DB:", JSON.stringify(db, null, 2));
    console.log("SMOKE_OK", JSON.stringify({
      tracking: TRACKING,
      taxAmount: result.taxAmount,
      linha: result.linha,
      pdfPath: result.pdfPath,
      paymentStatus: result.paymentStatus,
      orderId: db.order?.id || null,
      taxId: db.tax?.id || null,
      boletoId: db.boleto?.id || null,
    }));
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.ok = false;
    await shot(page, "99-error.png").catch(() => {});
    try {
      const db = await upsertDb(env, result);
      writeFileSync(join(MEDIA, "result.json"), JSON.stringify({ result, db }, null, 2));
      console.log("DB:", JSON.stringify(db, null, 2));
    } catch (dbErr) {
      console.error("DB upsert failed:", dbErr instanceof Error ? dbErr.message : dbErr);
    }
    console.error("SMOKE_FAIL", result.error);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
