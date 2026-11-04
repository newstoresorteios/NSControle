/**
 * Capture linha digitável + PDF from a pagfacil "Pagar boleto" page.
 * resumo.js copies a[data-codigo] via navigator.clipboard.writeText on
 * "#linkCodigoBarras a" click, and opens #urlBoleto on Imprimir.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function extractLinha(text) {
  if (!text) return null;
  const compact = String(text).replace(/\D/g, "");
  if (compact.length >= 47) return compact.slice(0, 47);
  return null;
}

export function parseMoney(text) {
  const m = String(text || "").match(/R\$\s*([\d.]+,\d{2})/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "").replace(",", ".")).toFixed(2);
}

async function readPagfacilFields(page) {
  return page.evaluate(() => {
    const urlBoleto = document.querySelector("#urlBoleto")?.value || "";
    const dataCodigo =
      document.querySelector("#linkCodigoBarras a")?.dataset?.codigo ||
      document.querySelector("a[data-codigo]")?.getAttribute("data-codigo") ||
      "";
    const pText = document.querySelector("#codigoBarras p")?.innerText || "";
    const pedido = document.querySelector("#pedido")?.value || "";
    const pagamentoId = document.querySelector("#pagamentoId")?.value || "";
    return { urlBoleto, dataCodigo, pText, pedido, pagamentoId, href: location.href };
  });
}

async function waitCodigoReady(page, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const f = await readPagfacilFields(page);
    if ((f.dataCodigo && f.dataCodigo.replace(/\D/g, "").length >= 47) || (f.pText && f.pText.replace(/\D/g, "").length >= 47) || (f.urlBoleto && f.urlBoleto.length > 10)) {
      return f;
    }
    await page.waitForTimeout(1000);
  }
  return readPagfacilFields(page);
}

/**
 * @param {import('playwright').Page} boletoPage
 * @param {import('playwright').BrowserContext} context
 * @param {{ tracking: string, boletosDir: string, mediaDir: string, shotPrefix?: string }} opts
 */
export async function capturePagfacilBoleto(boletoPage, context, opts) {
  const { tracking, boletosDir, mediaDir, shotPrefix = "pagfacil" } = opts;
  mkdirSync(boletosDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });

  await boletoPage.waitForLoadState("domcontentloaded").catch(() => {});
  await boletoPage.waitForTimeout(1500);
  await boletoPage.screenshot({ path: join(mediaDir, `${shotPrefix}-01-resumo.png`), fullPage: true }).catch(() => {});

  // Grant clipboard on this origin
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(boletoPage.url()).origin,
  }).catch(() => {});

  // Intercept clipboard writes (resumo.js uses writeText(dataset.codigo))
  await boletoPage.evaluate(() => {
    window.__copiedBarcode = null;
    try {
      const proto = navigator.clipboard;
      if (proto && !proto.__patchedForRpa) {
        const origWrite = proto.writeText.bind(proto);
        proto.writeText = async (text) => {
          window.__copiedBarcode = text;
          try {
            return await origWrite(text);
          } catch {
            return undefined;
          }
        };
        proto.__patchedForRpa = true;
      }
    } catch {
      /* ignore */
    }
  });

  let fields = await waitCodigoReady(boletoPage, 45000);
  console.log("pagfacil_fields", {
    dataCodigoLen: fields.dataCodigo ? fields.dataCodigo.replace(/\D/g, "").length : 0,
    pTextLen: fields.pText ? fields.pText.replace(/\D/g, "").length : 0,
    urlBoleto: fields.urlBoleto ? fields.urlBoleto.slice(0, 100) : null,
    pedido: fields.pedido || null,
    pagamentoId: fields.pagamentoId || null,
  });

  // If still empty, soft once (sometimes server fills on second paint)
  if (!fields.dataCodigo && !fields.pText?.replace(/\D/g, "") && !fields.urlBoleto) {
    console.log("pagfacil fields empty — reloading");
    await boletoPage.reload({ waitUntil: "domcontentloaded" });
    await boletoPage.waitForTimeout(2000);
    await boletoPage.evaluate(() => {
      window.__copiedBarcode = null;
      try {
        const proto = navigator.clipboard;
        if (proto && !proto.__patchedForRpa) {
          const origWrite = proto.writeText.bind(proto);
          proto.writeText = async (text) => {
            window.__copiedBarcode = text;
            try {
              return await origWrite(text);
            } catch {
              return undefined;
            }
          };
          proto.__patchedForRpa = true;
        }
      } catch {
        /* ignore */
      }
    });
    fields = await waitCodigoReady(boletoPage, 30000);
  }

  // Click Copiar código de barras (#linkCodigoBarras a) — Paulo's confirmed step
  const copiar = boletoPage.locator("#linkCodigoBarras a, a[data-codigo]").first()
    .or(boletoPage.getByText(/Copiar c[oó]digo de barras/i).first());
  if (await copiar.count()) {
    await copiar.click({ force: true });
    await boletoPage.waitForTimeout(800);
    await boletoPage.screenshot({ path: join(mediaDir, `${shotPrefix}-02-after-copiar.png`), fullPage: true }).catch(() => {});
  } else {
    console.log("Copiar código de barras control not found");
  }

  const intercepted = await boletoPage.evaluate(() => window.__copiedBarcode || null);
  let clip = "";
  try {
    clip = await boletoPage.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return "";
      }
    });
  } catch {
    clip = "";
  }

  // Re-read DOM after click (in case formatting filled #codigoBarras p)
  fields = await readPagfacilFields(boletoPage);

  let linha =
    extractLinha(intercepted) ||
    extractLinha(clip) ||
    extractLinha(fields.dataCodigo) ||
    extractLinha(fields.pText);

  console.log("linha_sources", {
    intercepted: intercepted ? `len=${String(intercepted).replace(/\D/g, "").length}` : null,
    clipboard: clip ? `len=${String(clip).replace(/\D/g, "").length}` : null,
    dataCodigo: fields.dataCodigo ? `len=${fields.dataCodigo.replace(/\D/g, "").length}` : null,
    pText: fields.pText ? `len=${fields.pText.replace(/\D/g, "").length}` : null,
    linha: linha ? `len=${linha.length}` : null,
  });

  const bodyText = await boletoPage.locator("body").innerText().catch(() => "");
  const amount = parseMoney(bodyText);
  const portal =
    fields.pedido ||
    (bodyText.match(/Resumo do Pedido\s*([0-9]+)/i) || [])[1] ||
    null;
  const dueMatch = bodyText.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i);
  let dueDate = null;
  if (dueMatch) {
    const [d, m, y] = dueMatch[1].split("/");
    dueDate = `${y}-${m}-${d}`;
  }

  // PDF via #urlBoleto or Imprimir Boleto popup
  let pdfBuf = null;
  let pdfPath = null;
  let pdfSha = null;
  const urlBoleto = fields.urlBoleto;
  if (urlBoleto) {
    const resp = await context.request.get(urlBoleto);
    const body = Buffer.from(await resp.body());
    if (resp.ok() && (body.slice(0, 4).toString() === "%PDF" || /pdf/i.test(resp.headers()["content-type"] || ""))) {
      pdfBuf = body;
      console.log("pdf via urlBoleto bytes=", body.length);
    }
  }
  if (!pdfBuf) {
    const imprimir = boletoPage.locator("#btn-imprimir-boleto, button:has-text('Imprimir Boleto')").first();
    if (await imprimir.count()) {
      const [pop] = await Promise.all([
        context.waitForEvent("page", { timeout: 25000 }).catch(() => null),
        imprimir.click({ force: true }),
      ]);
      await boletoPage.waitForTimeout(1000);
      await boletoPage.screenshot({ path: join(mediaDir, `${shotPrefix}-03-after-imprimir.png`), fullPage: true }).catch(() => {});
      if (pop) {
        await pop.waitForLoadState("domcontentloaded").catch(() => {});
        console.log("print_popup_url", pop.url());
        // wait for navigation off about:blank
        for (let i = 0; i < 20 && /^about:blank/i.test(pop.url()); i++) await pop.waitForTimeout(500);
        const popUrl = pop.url();
        if (popUrl && !/^about:blank/i.test(popUrl)) {
          const resp = await context.request.get(popUrl).catch(() => null);
          if (resp?.ok()) {
            const body = Buffer.from(await resp.body());
            if (body.slice(0, 4).toString() === "%PDF") pdfBuf = body;
          }
        }
        // Also try urlBoleto again (may fill after click)
        const again = await readPagfacilFields(boletoPage);
        if (!pdfBuf && again.urlBoleto) {
          const resp = await context.request.get(again.urlBoleto).catch(() => null);
          if (resp?.ok()) {
            const body = Buffer.from(await resp.body());
            if (body.slice(0, 4).toString() === "%PDF") pdfBuf = body;
          }
        }
        await pop.close().catch(() => {});
      }
    }
  }

  if (pdfBuf && pdfBuf.length > 100) {
    pdfPath = `storage/boletos/${tracking}.pdf`;
    writeFileSync(join(boletosDir, `${tracking}.pdf`), pdfBuf);
    pdfSha = createHash("sha256").update(pdfBuf).digest("hex");
    linha = linha || extractLinha(pdfBuf.toString("latin1"));
  }

  return {
    linha,
    amount,
    portalOrderId: portal,
    dueDate,
    pdfPath,
    pdfSha,
    pagamentoId: fields.pagamentoId || null,
    urlBoleto: urlBoleto || null,
    finalUrl: boletoPage.url(),
    bodySnippet: bodyText.slice(0, 1500),
  };
}
