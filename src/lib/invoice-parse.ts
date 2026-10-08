export type InvoiceTemplate = "edjouse" | "pesci" | "ca" | "ia" | "desconhecido";
export type InvoiceLineKind = "produto" | "taxa";

export type ParsedLine = {
  kind: InvoiceLineKind;
  description: string | null;
  reference: string | null;
  orderKey: string | null;
  quantity: number | null;
  unitAmount: number | null;
  lineAmount: number | null;
};

export type ParsedInvoice = {
  template: InvoiceTemplate;
  supplierName: string | null;
  billTo: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string;
  totalAmount: number | null;
  paymentMethod: string | null;
  bankName: string | null;
  iban: string | null;
  swift: string | null;
  beneficiary: string | null;
  dueDate: string | null;
  dueAmount: number | null;
  draft: boolean;
  lines: ParsedLine[];
  warning: string | null;
};

export const TEMPLATE_LABEL: Record<InvoiceTemplate, string> = {
  edjouse: "Fatura Edjouse",
  pesci: "Fatura Pesci",
  ca: "Fatura CA",
  ia: "Leitura por IA",
  desconhecido: "Layout novo",
};

const AMOUNT = String.raw`(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})`;

export function parseEuropeanAmount(raw: string): number | null {
  const text = raw.replace(/€/g, "").replace(/\s/g, "").trim();
  if (!text) return null;
  let normalized = text;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = text.replace(",", ".");
  }
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return round2(number);
}

export function parseDmy(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function blankInvoice(template: InvoiceTemplate, warning: string | null = null): ParsedInvoice {
  return {
    template,
    supplierName: null,
    billTo: null,
    invoiceNumber: null,
    invoiceDate: null,
    currency: "EUR",
    totalAmount: null,
    paymentMethod: null,
    bankName: null,
    iban: null,
    swift: null,
    beneficiary: null,
    dueDate: null,
    dueAmount: null,
    draft: false,
    lines: [],
    warning,
  };
}

export function parseInvoice(raw: string): ParsedInvoice {
  const text = raw.replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
  if (/OROLOGIO/.test(text) && /Fattura/i.test(text)) return finish(parsePesci(text));
  if (/Pedido\s+\d+/.test(text) && /Gastos suplidos|Comisi[oó]n de servicio/i.test(text)) return finish(parseCa(text));
  if (/INV-\d{4}-\d+/.test(text)) return finish(parseEdjouse(text));
  return finish(blankInvoice("desconhecido"));
}

export function finishParsed(invoice: ParsedInvoice): ParsedInvoice {
  return finish(invoice);
}

function finish(invoice: ParsedInvoice): ParsedInvoice {
  const warnings: string[] = [];
  if (invoice.draft) warnings.push("O PDF está marcado como rascunho.");
  if (invoice.warning) warnings.push(invoice.warning);
  const sum = round2(invoice.lines.reduce((total, line) => total + (line.lineAmount ?? 0), 0));
  if (invoice.totalAmount != null && invoice.lines.length && Math.abs(sum - invoice.totalAmount) > 0.05) {
    warnings.push("A soma das linhas não fecha com o total da fatura.");
  }
  return { ...invoice, warning: warnings.length ? warnings.join(" ") : null };
}

function parseEdjouse(text: string): ParsedInvoice {
  const invoice = blankInvoice("edjouse");
  const flat = oneLine(text);
  invoice.supplierName = firstMatch(text, /^(EDJOUSE[^\n]*)/m)?.replace(/\s+·.*/, "").trim() ?? null;
  invoice.billTo = afterLabel(text, "BILL TO");
  invoice.invoiceNumber = firstMatch(flat, /INV-\d{4}-\d+/);
  invoice.invoiceDate = parseDmy(firstMatch(flat, /Date:\s*(\d{2}\/\d{2}\/\d{4})/i, 1) ?? "");
  invoice.currency = firstMatch(flat, /Currency:\s*([A-Z]{3})/i, 1) ?? "EUR";
  invoice.totalAmount = amountAfter(flat, /TOTAL\s+€\s*([\d.,]+)/);
  invoice.bankName = bankName(lineAfter(text, /^Bank:\s*(.+)$/im));
  invoice.iban = ibanOf(text);
  invoice.swift = swiftOf(text);
  invoice.beneficiary = lineAfter(text, /^Beneficiary:\s*(.+)$/im);
  invoice.paymentMethod = lineAfter(text, /^Method:\s*(.+)$/im);
  const line = flat.match(
    new RegExp(String.raw`([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)+)\s+(\d+(?:[.,]\d+)?)\s+€\s*(${AMOUNT})\s+€\s*(${AMOUNT})`),
  );
  if (line) {
    invoice.lines.push({
      kind: "produto",
      description: null,
      reference: line[1],
      orderKey: null,
      quantity: parseEuropeanAmount(line[2]),
      unitAmount: parseEuropeanAmount(line[3]),
      lineAmount: parseEuropeanAmount(line[4]),
    });
  }
  return invoice;
}

function parsePesci(text: string): ParsedInvoice {
  const invoice = blankInvoice("pesci");
  const flat = oneLine(text);
  invoice.supplierName = /PESCI SRL/i.test(text) ? "PESCI SRL" : null;
  invoice.billTo = /BUSSOLA FENOMENAL/i.test(text) ? "BUSSOLA FENOMENAL - UNIPESSOAL LDA" : null;
  const header = flat.match(/Fattura\s+n\.?\s*(\d+\s*\/\s*[A-Z0-9]+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i);
  invoice.invoiceNumber = header?.[1]?.replace(/\s/g, "") ?? null;
  invoice.invoiceDate = parseDmy(header?.[2] ?? "");
  invoice.totalAmount = amountAfter(flat, /Totale\s+([\d.,]+)\s*€/i);
  invoice.bankName = lineAfter(text, /^Banca:\s*(.+)$/im);
  invoice.iban = ibanOf(text);
  invoice.swift = swiftOf(text);
  invoice.paymentMethod = /Bonifico/i.test(text) ? "Bonifico" : null;
  const due = flat.match(new RegExp(String.raw`(${AMOUNT})\s*€\s+il\s+(\d{2}\/\d{2}\/\d{4})`));
  invoice.dueAmount = due ? parseEuropeanAmount(due[1]) : null;
  invoice.dueDate = due ? parseDmy(due[2]) : null;
  const lines = flat.matchAll(
    new RegExp(String.raw`OROLOGIO\s+([A-Z0-9.]+)\s+([\d.,]+)\s*pz\s+(${AMOUNT})\s*€\s+.+?\s+(${AMOUNT})\s*€`, "g"),
  );
  for (const line of lines) {
    invoice.lines.push({
      kind: "produto",
      description: null,
      reference: line[1],
      orderKey: null,
      quantity: parseEuropeanAmount(line[2]),
      unitAmount: parseEuropeanAmount(line[3]),
      lineAmount: parseEuropeanAmount(line[4]),
    });
  }
  return invoice;
}

function parseCa(text: string): ParsedInvoice {
  const invoice = blankInvoice("ca");
  const flat = oneLine(text);
  invoice.draft = /borrador|draft/i.test(text);
  invoice.invoiceNumber = firstMatch(flat, /Factura\s+(CA\d+)/i, 1);
  invoice.invoiceDate = parseDmy(firstMatch(flat, /Fecha de emisi[oó]n\s+(\d{2}\/\d{2}\/\d{4})/i, 1) ?? "");
  invoice.billTo = lineAfter(text, /Fecha de emisi[oó]n\s+\d{2}\/\d{2}\/\d{4}\n([^\n]+)/i);
  invoice.supplierName = lineBefore(text, /^Y\d{7}[A-Z]$/m);
  invoice.paymentMethod = lineAfter(text, /^M[eé]todo de pago\s+(.+)$/im);
  const totals = [...flat.matchAll(new RegExp(String.raw`Total\s+(${AMOUNT})\s*€`, "g"))];
  invoice.totalAmount = totals.length ? parseEuropeanAmount(totals[totals.length - 1][1]) : null;
  const fee = flat.match(new RegExp(String.raw`Comisi[oó]n de servicio\s+(\d+(?:[.,]\d+)?)\s+(${AMOUNT})\s*€\s+(${AMOUNT})\s*€`, "i"));
  if (fee) {
    const note = firstMatch(text, /Servicio de compra asistida[^\n]*/i);
    invoice.lines.push({
      kind: "taxa",
      description: note ? `Comisión de servicio — ${note}` : "Comisión de servicio",
      reference: null,
      orderKey: null,
      quantity: parseEuropeanAmount(fee[1]),
      unitAmount: parseEuropeanAmount(fee[2]),
      lineAmount: parseEuropeanAmount(fee[3]),
    });
  }
  const products = flat.matchAll(
    new RegExp(
      String.raw`Pedido\s+(\d+)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(${AMOUNT})\s*€\s+(${AMOUNT})\s*€`,
      "g",
    ),
  );
  for (const line of products) {
    const product = splitProduct(line[2]);
    invoice.lines.push({
      kind: "produto",
      description: product.description,
      reference: product.reference,
      orderKey: line[1],
      quantity: parseEuropeanAmount(line[3]),
      unitAmount: parseEuropeanAmount(line[4]),
      lineAmount: parseEuropeanAmount(line[5]),
    });
  }
  return invoice;
}

export function splitProduct(raw: string): { description: string | null; reference: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const tokens = text.split(" ");
  const index = tokens.findIndex((token) => /\d/.test(token) && token.replace(/[^A-Za-z0-9]/g, "").length >= 4);
  if (index <= 0) return { description: null, reference: text };
  const start = /^[A-Z]{2,4}$/.test(tokens[index - 1] ?? "") ? index - 1 : index;
  const description = tokens.slice(0, start).join(" ");
  return {
    description: description || null,
    reference: tokens.slice(start).join(" "),
  };
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function firstMatch(text: string, pattern: RegExp, group = 0): string | null {
  const match = text.match(pattern);
  const value = match?.[group]?.trim();
  return value || null;
}

function lineAfter(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1]?.trim() || null;
}

function afterLabel(text: string, label: string): string | null {
  const lines = text.split("\n").map((line) => line.trim());
  const index = lines.findIndex((line) => line.toUpperCase() === label.toUpperCase());
  if (index < 0) return null;
  return lines[index + 1] || null;
}

function lineBefore(text: string, pattern: RegExp): string | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index <= 0) return null;
  return lines[index - 1] || null;
}

function bankName(value: string | null): string | null {
  if (!value) return null;
  return value.split("·")[0]?.trim() || null;
}

function ibanOf(text: string): string | null {
  const raw = lineAfter(text, /^IBAN:\s*(.+)$/im);
  if (!raw) return null;
  const compact = raw.split(/\s+(?:BIC|SWIFT)\b/i)[0]?.replace(/\s/g, "").toUpperCase() ?? "";
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(compact) ? compact : null;
}

function swiftOf(text: string): string | null {
  return (
    lineAfter(text, /SWIFT\/BIC:\s*([A-Z0-9]+)/i) ??
    lineAfter(text, /\bBIC:\s*([A-Z0-9]+)/i)
  );
}

function amountAfter(text: string, pattern: RegExp): number | null {
  const raw = firstMatch(text, pattern, 1);
  return raw ? parseEuropeanAmount(raw) : null;
}

export function parseAiPayload(content: unknown): ParsedInvoice | null {
  const value = asObject(content);
  if (!value) return null;
  const lines = Array.isArray(value.lines)
    ? value.lines.slice(0, 80).map(asLine).filter((line): line is ParsedLine => line != null)
    : [];
  const invoice = blankInvoice("ia");
  invoice.supplierName = asText(value.supplierName);
  invoice.billTo = asText(value.billTo);
  invoice.invoiceNumber = asText(value.invoiceNumber);
  invoice.invoiceDate = asDate(value.invoiceDate);
  invoice.currency = asCurrency(value.currency);
  invoice.totalAmount = asAmount(value.totalAmount);
  invoice.paymentMethod = asText(value.paymentMethod);
  invoice.bankName = asText(value.bankName);
  invoice.iban = asText(value.iban);
  invoice.swift = asText(value.swift);
  invoice.beneficiary = asText(value.beneficiary);
  invoice.dueDate = asDate(value.dueDate);
  invoice.dueAmount = asAmount(value.dueAmount);
  invoice.draft = value.draft === true;
  invoice.lines = lines;
  if (!invoice.supplierName && !invoice.invoiceNumber && !lines.length) return null;
  if (invoice.totalAmount != null && Math.abs(invoice.totalAmount) > 10_000_000) return null;
  return finish(invoice);
}

function asObject(content: unknown): Record<string, unknown> | null {
  if (content && typeof content === "object" && !Array.isArray(content)) return content as Record<string, unknown>;
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function asLine(value: unknown): ParsedLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const kind = row.kind === "taxa" ? "taxa" : row.kind === "produto" ? "produto" : null;
  if (!kind) return null;
  const orderKey = asText(row.orderKey);
  return {
    kind,
    description: asText(row.description),
    reference: asText(row.reference),
    orderKey: orderKey && /^\d+$/.test(orderKey) ? orderKey : null,
    quantity: asAmount(row.quantity),
    unitAmount: asAmount(row.unitAmount),
    lineAmount: asAmount(row.lineAmount),
  };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 500) : null;
}

function asDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return parseDmy(value);
}

function asCurrency(value: unknown): string {
  if (typeof value === "string" && /^[A-Za-z]{3}$/.test(value.trim())) return value.trim().toUpperCase();
  return "EUR";
}

function asAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return round2(value);
  if (typeof value === "string") return parseEuropeanAmount(value);
  return null;
}
