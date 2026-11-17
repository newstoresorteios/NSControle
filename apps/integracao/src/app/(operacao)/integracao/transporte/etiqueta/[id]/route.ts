import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Etiqueta não encontrada.", { status: 404 });
  const [row] = await db()`select label_pdf from ctl_integration_shipments where id = ${id}`;
  const pdf = row?.label_pdf;
  if (!pdf) return new Response("Etiqueta não encontrada.", { status: 404 });
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiqueta-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
