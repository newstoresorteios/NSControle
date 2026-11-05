import { photoResponse } from '../../photo';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; pos: string }> }) {
  const { id, pos } = await params;
  if (!/^\d+$/.test(pos)) return new Response(null, { status: 404 });
  return photoResponse(id, Number(pos));
}
