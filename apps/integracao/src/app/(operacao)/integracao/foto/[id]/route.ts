import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(_request: Request, {params}: {params: Promise<{id:string}>}) {
  await requireOperator();
  const {id} = await params;
  if (!/^\d+$/.test(id)) return new Response(null,{status:404});
  const [unit] = await db()`select photo, photo_type from ctl_integration_units where id = ${id}`;
  if (!unit) return new Response(null,{status:404});
  return new Response(new Uint8Array(unit.photo), {headers:{'Content-Type':unit.photo_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
