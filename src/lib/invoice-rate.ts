import { db } from "@/lib/db";
import { asNumber } from "@/lib/format";
import { ptaxRate, type PtaxQuote } from "@/lib/fx";

export async function rememberInvoiceRate(
  id: string,
  currency: string,
  invoiceDate: string | null,
  fxRate: unknown,
  fxDate: string | null,
): Promise<PtaxQuote | null> {
  const stored = asNumber(fxRate);
  if (stored != null && stored > 0) return { rate: stored, quoteDate: fxDate?.slice(0, 10) ?? invoiceDate?.slice(0, 10) ?? "" };
  if (!invoiceDate) return null;
  const quote = await ptaxRate(currency || "EUR", invoiceDate.slice(0, 10));
  if (!quote) return null;
  await db()`
    update ctl_supplier_invoices
    set fx_rate = ${quote.rate}, fx_date = ${quote.quoteDate}, fx_source = 'PTAX venda'
    where id = ${id}
  `;
  return quote;
}
