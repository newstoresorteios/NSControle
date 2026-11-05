import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';

function image(photo: Buffer, type: string) {
  return new Response(new Uint8Array(photo), {
    headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function photoResponse(id: string, position: number) {
  await requireOperator();
  if (!/^\d+$/.test(id) || position < 0 || position > 7) return new Response(null, { status: 404 });
  const [row] = await db()`select photo, photo_type from ctl_integration_unit_photos where unit_id = ${id} and position = ${position}`;
  if (row) return image(row.photo, row.photo_type);
  if (position !== 0) return new Response(null, { status: 404 });
  const [unit] = await db()`select photo, photo_type from ctl_integration_units where id = ${id}`;
  if (!unit?.photo) return new Response(null, { status: 404 });
  return image(unit.photo, unit.photo_type);
}
