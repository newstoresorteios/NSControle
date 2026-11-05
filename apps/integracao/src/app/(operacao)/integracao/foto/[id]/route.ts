import { photoResponse } from '../photo';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return photoResponse(id, 0);
}
