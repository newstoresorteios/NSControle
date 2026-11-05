import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const sql = db();
  const [unit] = await sql`select u.id, u.serial_number, i.brand, i.model
    from ctl_integration_units u join ctl_integration_stock i on i.id = u.inventory_id
    where u.id = ${id}`;
  if (!unit) notFound();
  const photos = await sql`select position from ctl_integration_unit_photos where unit_id = ${id} order by position`;
  const positions = photos.length ? photos.map((photo) => Number(photo.position)) : [0];

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Unidade #{unit.id}</p>
        <h1 className="page-title mt-2">{unit.brand} {unit.model}</h1>
        <p className="text-muted">Série {unit.serial_number} · {positions.length} {positions.length === 1 ? 'foto' : 'fotos'}</p>
      </header>
      <div className="gallery">
        {positions.map((position) => (
          <a key={position} href={`/integracao/foto/${unit.id}/${position}`} target="_blank" rel="noreferrer">
            <img src={`/integracao/foto/${unit.id}/${position}`} alt={`Foto ${position + 1} da unidade ${unit.id}`} />
          </a>
        ))}
      </div>
      <Link className="text-sm underline" href="/integracao/estoque">Voltar ao estoque</Link>
    </div>
  );
}
