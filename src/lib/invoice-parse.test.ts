import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { suggestInvoice, type OrderHit } from "./invoice-match.ts";
import { parseAiPayload, parseEuropeanAmount, parseInvoice } from "./invoice-parse.ts";

function sample(name: string) {
  return readFileSync(new URL(`./invoice-samples/${name}.txt`, import.meta.url), "utf8");
}

test("valores europeus e americanos", () => {
  assert.equal(parseEuropeanAmount("761.00"), 761);
  assert.equal(parseEuropeanAmount("1.036,00"), 1036);
  assert.equal(parseEuropeanAmount("559,42"), 559.42);
  assert.equal(parseEuropeanAmount("4,00"), 4);
});

test("fatura Edjouse lê uma linha e o pagamento", () => {
  const invoice = parseInvoice(sample("edjouse"));
  assert.equal(invoice.template, "edjouse");
  assert.equal(invoice.invoiceNumber, "INV-2026-123");
  assert.equal(invoice.invoiceDate, "2026-10-06");
  assert.equal(invoice.supplierName, "EDJOUSE LIMA SANTOS NUNES");
  assert.equal(invoice.billTo, "NEW STORE RELOGIOS");
  assert.equal(invoice.totalAmount, 761);
  assert.equal(invoice.iban, "BE49905079682271");
  assert.equal(invoice.swift, "TRWIBEB1XXX");
  assert.equal(invoice.bankName, "Wise Europe SA");
  assert.equal(invoice.beneficiary, "Edjouse Lima Santos Nunes");
  assert.equal(invoice.paymentMethod, "Transferencia bancaria / SEPA");
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.lines[0]?.reference, "C048.807.11.051.00");
  assert.equal(invoice.lines[0]?.quantity, 1);
  assert.equal(invoice.lines[0]?.lineAmount, 761);
  assert.equal(invoice.warning, null);
});

test("fattura Pesci lê os códigos e fecha o total", () => {
  const invoice = parseInvoice(sample("pesci"));
  assert.equal(invoice.template, "pesci");
  assert.equal(invoice.invoiceNumber, "247/E");
  assert.equal(invoice.invoiceDate, "2026-10-07");
  assert.equal(invoice.supplierName, "PESCI SRL");
  assert.equal(invoice.billTo, "BUSSOLA FENOMENAL - UNIPESSOAL LDA");
  assert.equal(invoice.totalAmount, 8078.11);
  assert.equal(invoice.dueAmount, 8078.11);
  assert.equal(invoice.dueDate, "2026-10-07");
  assert.equal(invoice.iban, "IT46X0306921103100000003954");
  assert.equal(invoice.swift, "BCITITMM");
  assert.equal(invoice.bankName, "INTESA SANPAOLO SPA");
  assert.equal(invoice.paymentMethod, "Bonifico");
  assert.equal(invoice.lines.length, 12);
  assert.equal(invoice.lines[0]?.reference, "T137.807.44.061.00");
  assert.equal(invoice.lines[0]?.quantity, 4);
  assert.equal(invoice.lines[0]?.unitAmount, 559.42);
  assert.equal(invoice.lines[0]?.lineAmount, 2237.68);
  assert.equal(invoice.lines[11]?.reference, "H70455533");
  assert.equal(invoice.warning, null);
});

test("fatura CA separa comissão e pedidos", () => {
  const invoice = parseInvoice(sample("ca"));
  assert.equal(invoice.template, "ca");
  assert.equal(invoice.draft, true);
  assert.match(invoice.warning ?? "", /rascunho/);
  assert.equal(invoice.invoiceNumber, "CA26");
  assert.equal(invoice.invoiceDate, "2026-10-06");
  assert.equal(invoice.supplierName, "Ana Luiza Moraes Fortuna Santos");
  assert.equal(invoice.billTo, "L F NEWBOLD NEVES MANTA");
  assert.equal(invoice.totalAmount, 1618.51);
  assert.equal(invoice.lines[0]?.kind, "taxa");
  assert.equal(invoice.lines[0]?.lineAmount, 47.13);
  assert.equal(invoice.lines[1]?.orderKey, "26184");
  assert.equal(invoice.lines[1]?.reference, "NK5010-51L");
  assert.equal(invoice.lines[2]?.description, "Brazaletes");
  assert.equal(invoice.lines[2]?.reference, "CW 20-WEB-02-SXC-DC-ST");
  assert.equal(invoice.lines[3]?.orderKey, "26228");
  assert.equal(invoice.lines[4]?.orderKey, "26228");
  assert.equal(invoice.lines[5]?.reference, "FC-303NN5B6B");
  assert.equal(invoice.lines[5]?.lineAmount, 1036);
  assert.equal(invoice.lines.length, 6);
  assert.doesNotMatch(invoice.warning ?? "", /não fecha/);
});

test("os três PDFs reais caem no modelo certo", async (t) => {
  const files = [
    ["C:/Users/Pichau/Downloads/INV-2026-123_Edjouse_Lima_NewStore.pdf", "edjouse", "INV-2026-123"],
    [
      "C:/Users/Pichau/Downloads/Fattura - n 247_E del 07_10_2026 - BUSSOLA FENOMENAL - UNIPESSOAL LDA.pdf",
      "pesci",
      "247/E",
    ],
    ["C:/Users/Pichau/Downloads/CA26 - 32.pdf", "ca", "CA26"],
  ];
  if (!existsSync(files[0][0])) return t.skip();
  const { pdfToText } = await import("./invoice-pdf.ts");
  for (const [file, template, number] of files) {
    const text = await pdfToText(new Uint8Array(readFileSync(file)));
    const invoice = parseInvoice(text);
    assert.equal(invoice.template, template);
    assert.equal(invoice.invoiceNumber, number);
    assert.equal(invoice.warning == null || /rascunho/.test(invoice.warning), true);
  }
});

test("layout desconhecido não inventa linha", () => {
  const invoice = parseInvoice("Nota qualquer sem itens de relógio.");
  assert.equal(invoice.template, "desconhecido");
  assert.equal(invoice.lines.length, 0);
});

test("vínculo usa número do pedido e, sem ele, a referência", () => {
  const orders: OrderHit[] = [
    hit("a", "26184", "NK5010-51L"),
    hit("b", "26228", "T852.041.534 / T852.046.829"),
    hit("c", "9001", "C048.807.11.051.00"),
    hit("d", "9002", "T137.807.44.061.00"),
    hit("e", "9003", "T137.807.44.061.00"),
    hit("f", "9004", "outro"),
  ];
  const ca = parseInvoice(sample("ca"));
  const linked = suggestInvoice(ca.lines, orders);
  assert.deepEqual(linked[0]?.orderIds, []);
  assert.match(linked[0]?.note ?? "", /Taxa/);
  assert.deepEqual(linked[1]?.orderIds, ["a"]);
  assert.deepEqual(linked[3]?.orderIds, ["b"]);
  assert.deepEqual(linked[4]?.orderIds, ["b"]);

  const edjouse = parseInvoice(sample("edjouse"));
  const one = suggestInvoice(edjouse.lines, orders);
  assert.deepEqual(one[0]?.orderIds, ["c"]);

  const many = suggestInvoice(
    [{ kind: "produto", reference: "T137.807.44.061.00", orderKey: null, quantity: 1 }],
    orders,
  );
  assert.deepEqual(many[0]?.orderIds, []);
  assert.match(many[0]?.note ?? "", /Escolha/);

  const partial = suggestInvoice(
    [{ kind: "produto", reference: "T137.807.44.061.00", orderKey: null, quantity: 4 }],
    orders,
  );
  assert.deepEqual(partial[0]?.orderIds, ["d", "e"]);
  assert.match(partial[0]?.note ?? "", /2 de 4/);

  const exact = suggestInvoice(
    [{ kind: "produto", reference: "T137.807.44.061.00", orderKey: null, quantity: 2 }],
    orders,
  );
  assert.deepEqual(exact[0]?.orderIds, ["d", "e"]);

  const ranked = suggestInvoice(
    [{ kind: "produto", reference: "T137.807.44.061.00", orderKey: null, quantity: 1 }],
    [
      { ...hit("old", "1", "T137.807.44.061.00"), purchased: true, updatedAt: "2026-10-08" },
      { ...hit("open", "2", "T137.807.44.061.00"), purchased: false, updatedAt: "2026-09-01" },
    ],
  );
  assert.equal(ranked[0]?.candidates[0]?.id, "open");
});

test("resposta da IA só entra com o formato esperado", () => {
  const parsed = parseAiPayload(`\`\`\`json
    {"supplierName":"Fornecedor","invoiceNumber":"10","invoiceDate":"07/10/2026","currency":"eur","totalAmount":"10,50","lines":[{"kind":"produto","reference":"ABC12345","quantity":"1","unitAmount":10.5,"lineAmount":10.5},{"kind":"outro"}]}
  \`\`\``);
  assert.equal(parsed?.template, "ia");
  assert.equal(parsed?.invoiceDate, "2026-10-07");
  assert.equal(parsed?.currency, "EUR");
  assert.equal(parsed?.totalAmount, 10.5);
  assert.equal(parsed?.lines.length, 1);
  assert.equal(parseAiPayload("sem json"), null);
  assert.equal(parseAiPayload({ totalAmount: 99_000_000, lines: [] }), null);
});

function hit(id: string, orderKey: string, reference: string): OrderHit {
  return {
    id,
    orderKey,
    label: null,
    productName: null,
    reference,
    supplierRef: null,
    flow: "loja_nova",
  };
}
