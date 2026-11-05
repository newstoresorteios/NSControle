import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { anaOriginAllowed } from "@/lib/integracao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const [invoice] = await db()<{ document: Uint8Array; document_type: string | null; source_filename: string | null; origin: string | null }[]>`
    select i.document, i.document_type, i.source_filename, o.origin
    from ctl_supplier_invoices i
    join ctl_supplier_invoice_lines l on l.invoice_id = i.id
    join ctl_supplier_invoice_links k on k.line_id = l.id
    join ctl_integration_purchase_requests r on r.order_id = k.order_id
    join ctl_orders o on o.id = r.order_id
    where i.id = ${id}
      and i.document is not null
      and lower(translate(btrim(coalesce(o.origin, '')), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouc')) = 'europa'
    limit 1
  `;
  if (!invoice?.document || !anaOriginAllowed(invoice.origin)) return new Response(null, { status: 404 });
  const filename = attachmentName(invoice.source_filename);
  return new Response(new Uint8Array(invoice.document), {
    headers: {
      "Content-Type": invoice.document_type || "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function attachmentName(name: string | null) {
  const clean = (name || "fatura.pdf").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return clean.toLowerCase().endsWith(".pdf") ? clean : "fatura.pdf";
}
