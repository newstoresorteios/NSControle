import Link from 'next/link';
import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';
import { relocateUnit } from '../actions';
import { Field, Notice } from '../ui';

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; q?: string }> }) {
  await requireOperator();
  const params = await searchParams;
  const sql = db();
  const units = await sql`select u.id, u.serial_number, u.weight_g, i.brand, i.model, i.location, i.status, o.order_key,
      (select count(*)::int from ctl_integration_unit_photos p where p.unit_id = u.id) as photo_count
    from ctl_integration_units u
    join ctl_integration_stock i on i.id = u.inventory_id
    left join ctl_orders o on o.id = i.order_id
    where (${params.q || ''} = '' or i.model ilike ${`%${params.q || ''}%`} or u.serial_number ilike ${`%${params.q || ''}%`} or u.id::text = ${params.q || ''})
    order by u.id desc limit 100`;
  const ids = units.map((unit) => Number(unit.id));
  const events = ids.length
    ? await sql`select unit_id, action, actor, created_at from ctl_integration_events where unit_id = any(${ids}) order by id desc`
    : [];
  const history = new Map<number, { action: string; actor: string; created_at: string }[]>();
  for (const event of events) {
    const id = Number(event.unit_id);
    const move = { action: String(event.action), actor: String(event.actor), created_at: String(event.created_at) };
    const list = history.get(id);
    if (list) list.push(move);
    else history.set(id, [move]);
  }

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p>
        <h1 className="page-title mt-2">Estoque</h1>
        <p className="text-muted">Disponibilidade, localização, reserva e histórico de cada unidade, com foto e ID.</p>
      </header>
      <Notice ok={params.ok} erro={params.erro} />
      <section className="card overflow-x-auto">
        <form className="mb-3 flex gap-2">
          <input aria-label="Buscar unidade" name="q" defaultValue={params.q} placeholder="ID, série ou modelo" />
          <button className="secondary">Buscar</button>
        </form>
        <table>
          <thead><tr><th>ID / foto</th><th>Relógio / série</th><th>Localização</th><th>Peso</th><th>Status</th><th>Histórico</th><th>Etiqueta</th></tr></thead>
          <tbody>
            {units.map((unit) => {
              const count = Number(unit.photo_count) || 1;
              const moves = history.get(Number(unit.id)) || [];
              return (
                <tr key={unit.id}>
                  <td>
                    <Link href={`/integracao/galeria/${unit.id}`} className="gallery-link">
                      <img className="unit-thumb" src={`/integracao/foto/${unit.id}`} alt="" />
                      <span>#{unit.id} · {count} {count === 1 ? 'foto' : 'fotos'}</span>
                    </Link>
                  </td>
                  <td>{unit.brand} {unit.model}<p className="text-xs text-muted">Série: {unit.serial_number}</p></td>
                  <td>{unit.location}</td>
                  <td>{unit.weight_g} g</td>
                  <td>{unit.order_key && unit.status !== 'Enviado' ? `Reservado · pedido #${unit.order_key}` : unit.status}</td>
                  <td>
                    {moves.length ? (
                      <details>
                        <summary className="cursor-pointer text-sm underline">{moves[0].action}</summary>
                        <ul className="mt-2 grid gap-1 text-xs">
                          {moves.map((event, index) => (
                            <li key={`${unit.id}-${index}`}>{event.action} · {event.actor} · {new Date(event.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</li>
                          ))}
                        </ul>
                      </details>
                    ) : '—'}
                  </td>
                  <td><Link className="underline" href={`/integracao/etiqueta/${unit.id}`} target="_blank">Imprimir ID</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!units.length ? <p className="py-4 text-muted">Nenhuma unidade encontrada.</p> : <p className="mt-3 text-xs text-muted">Até 100 unidades por consulta.</p>}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm underline">Alterar localização de uma unidade</summary>
          <form action={relocateUnit} className="mt-3 grid gap-3 md:grid-cols-3">
            <Field name="unit_id" label="ID da unidade" type="number" required />
            <Field name="location" label="Nova localização" required />
            <button>Salvar localização</button>
          </form>
        </details>
      </section>
    </div>
  );
}
