/**
 * Estimativa gerencial de Lucro Real (RJ).
 * Não substitui apuração contábil / SPED.
 */

export type LucroRealOrder = {
  sale_amount: unknown;
  purchase_amount: unknown;
  payment_fee: unknown;
  shipping_cost: unknown;
  import_tax: unknown;
};

export type LucroRealDefaults = {
  /** Fração do sale usada quando purchase_amount falta (ex.: 0.5434). */
  purchasePctOfSale: number;
  /** Média de taxa de pagamento por pedido sem payment_fee. */
  avgPaymentFee: number;
  /** Média de frete por pedido sem shipping_cost. */
  avgShipping: number;
  /** PIS 1,65% + COFINS 7,6%. */
  pisCofinsRate: number;
  /** ICMS interno RJ. */
  icmsRate: number;
  /**
   * Fração do crédito ICMS ideal sobre o CMV (1 = integral; 0.7 = importação cautelosa).
   */
  icmsCreditFactor: number;
  /** Limite mensal do adicional de IRPJ (R$). */
  irpjAdditionalThreshold: number;
};

export const LUCRO_REAL_RJ_DEFAULTS: LucroRealDefaults = {
  purchasePctOfSale: 0.5434,
  avgPaymentFee: 233.47,
  avgShipping: 177,
  pisCofinsRate: 0.0925,
  icmsRate: 0.2,
  icmsCreditFactor: 1,
  irpjAdditionalThreshold: 20_000,
};

export type LucroRealBreakdown = {
  vendas: number;
  pedidosComVenda: number;
  compraPreenchida: number;
  compraEstimada: number;
  compraTotal: number;
  pedidosSemCompra: number;
  taxaPgtoPreenchida: number;
  taxaPgtoEstimada: number;
  taxaPgtoTotal: number;
  fretePreenchido: number;
  freteEstimado: number;
  freteTotal: number;
  taxaImportacao: number;
  custosOperacionais: number;
  lucroOperacional: number;
  pisCofinsDebito: number;
  pisCofinsCredito: number;
  pisCofinsLiquido: number;
  icmsDebito: number;
  icmsCredito: number;
  icmsLiquido: number;
  baseIrpjCsll: number;
  irpj: number;
  irpjAdicional: number;
  csll: number;
  irpjCsllTotal: number;
  lucroLiquido: number;
  margemOperacional: number | null;
  margemLiquida: number | null;
  cargaTributaria: number;
  cargaTributariaPct: number | null;
  icmsCreditFactor: number;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function estimateLucroReal(
  orders: LucroRealOrder[],
  overrides: Partial<LucroRealDefaults> = {},
): LucroRealBreakdown {
  const cfg = { ...LUCRO_REAL_RJ_DEFAULTS, ...overrides };
  let vendas = 0;
  let pedidosComVenda = 0;
  let compraPreenchida = 0;
  let compraEstimada = 0;
  let pedidosSemCompra = 0;
  let taxaPgtoPreenchida = 0;
  let taxaPgtoEstimada = 0;
  let fretePreenchido = 0;
  let freteEstimado = 0;
  let taxaImportacao = 0;

  for (const order of orders) {
    const sale = num(order.sale_amount);
    if (sale == null) continue;
    pedidosComVenda += 1;
    vendas += sale;

    const purchase = num(order.purchase_amount);
    if (purchase != null) {
      compraPreenchida += purchase;
    } else {
      pedidosSemCompra += 1;
      compraEstimada += sale * cfg.purchasePctOfSale;
    }

    const fee = num(order.payment_fee);
    if (fee != null) {
      taxaPgtoPreenchida += fee;
    } else {
      taxaPgtoEstimada += cfg.avgPaymentFee;
    }

    const ship = num(order.shipping_cost);
    if (ship != null) {
      fretePreenchido += ship;
    } else {
      freteEstimado += cfg.avgShipping;
    }

    taxaImportacao += num(order.import_tax) ?? 0;
  }

  const compraTotal = compraPreenchida + compraEstimada;
  const taxaPgtoTotal = taxaPgtoPreenchida + taxaPgtoEstimada;
  const freteTotal = fretePreenchido + freteEstimado;
  const custosOperacionais = compraTotal + taxaPgtoTotal + freteTotal + taxaImportacao;
  const lucroOperacional = vendas - custosOperacionais;

  const pisCofinsDebito = vendas * cfg.pisCofinsRate;
  const pisCofinsCredito = compraTotal * cfg.pisCofinsRate;
  const pisCofinsLiquido = Math.max(0, pisCofinsDebito - pisCofinsCredito);

  const icmsDebito = vendas * cfg.icmsRate;
  const icmsCredito = compraTotal * cfg.icmsRate * cfg.icmsCreditFactor;
  const icmsLiquido = Math.max(0, icmsDebito - icmsCredito);

  const baseIrpjCsll = Math.max(0, lucroOperacional - pisCofinsLiquido - icmsLiquido);
  const irpj = baseIrpjCsll * 0.15;
  const irpjAdicional = Math.max(0, baseIrpjCsll - cfg.irpjAdditionalThreshold) * 0.1;
  const csll = baseIrpjCsll * 0.09;
  const irpjCsllTotal = irpj + irpjAdicional + csll;
  const lucroLiquido = baseIrpjCsll - irpjCsllTotal;
  const cargaTributaria = pisCofinsLiquido + icmsLiquido + irpjCsllTotal;

  return {
    vendas: round2(vendas),
    pedidosComVenda,
    compraPreenchida: round2(compraPreenchida),
    compraEstimada: round2(compraEstimada),
    compraTotal: round2(compraTotal),
    pedidosSemCompra,
    taxaPgtoPreenchida: round2(taxaPgtoPreenchida),
    taxaPgtoEstimada: round2(taxaPgtoEstimada),
    taxaPgtoTotal: round2(taxaPgtoTotal),
    fretePreenchido: round2(fretePreenchido),
    freteEstimado: round2(freteEstimado),
    freteTotal: round2(freteTotal),
    taxaImportacao: round2(taxaImportacao),
    custosOperacionais: round2(custosOperacionais),
    lucroOperacional: round2(lucroOperacional),
    pisCofinsDebito: round2(pisCofinsDebito),
    pisCofinsCredito: round2(pisCofinsCredito),
    pisCofinsLiquido: round2(pisCofinsLiquido),
    icmsDebito: round2(icmsDebito),
    icmsCredito: round2(icmsCredito),
    icmsLiquido: round2(icmsLiquido),
    baseIrpjCsll: round2(baseIrpjCsll),
    irpj: round2(irpj),
    irpjAdicional: round2(irpjAdicional),
    csll: round2(csll),
    irpjCsllTotal: round2(irpjCsllTotal),
    lucroLiquido: round2(lucroLiquido),
    margemOperacional: vendas > 0 ? lucroOperacional / vendas : null,
    margemLiquida: vendas > 0 ? lucroLiquido / vendas : null,
    cargaTributaria: round2(cargaTributaria),
    cargaTributariaPct: vendas > 0 ? cargaTributaria / vendas : null,
    icmsCreditFactor: cfg.icmsCreditFactor,
  };
}
