import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireTeam();
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const [invoice] = await db()<{ document: Uint8Array; document_type: string | null; source_filename: string | null }[]>`
    select document, document_type, source_filename
    from ctl_supplier_invoices
    where id = ${id} and document is not null
    limit 1
  `;
  if (!invoice?.document) return new Response(null, { status: 404 });
  const filename = (invoice.source_filename || "fatura.pdf").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return new Response(new Uint8Array(invoice.document), {
    headers: {
      "Content-Type": invoice.document_type || "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.toLowerCase().endsWith(".pdf") ? filename : "fatura.pdf"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
