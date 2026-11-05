import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function ControlePage() {
  const actor = await requireOperator();
  const sql = db();
  const [counts] = await sql`select
      count(*)::int as total,
      count(*) filter (where i.status = 'Disponível' and i.order_id is null)::int as available,
      count(*) filter (where i.order_id is not null and i.status <> 'Enviado')::int as reserved,
      count(*) filter (where i.status = 'Enviado')::int as sent
    from ctl_integration_units u join ctl_integration_stock i on i.id = u.inventory_id`;
  const [preparing] = await sql`select count(*)::int as total from ctl_integration_shipments where status in ('pendente','preparando','embalado')`;
  const events = await sql`select e.id, e.unit_id, e.action, e.actor, e.created_at from ctl_integration_events e order by e.id desc limit 100`;
  const profile = actor.role === 'newstore' ? 'Admin New Store' : 'Equipe Redirect';

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p>
        <h1 className="page-title mt-2">Controle</h1>
        <p className="text-muted">Histórico de movimentações e visão das unidades. Você está como {profile}.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          [counts.total, 'Unidades recebidas'],
          [counts.available, 'Disponíveis'],
          [counts.reserved, 'Reservadas'],
          [preparing.total, 'Em preparação ou embaladas'],
        ].map(([value, label]) => (
          <div className="card" key={label}><p className="text-3xl">{value}</p><p className="text-sm text-muted">{label}</p></div>
        ))}
      </div>
      <section className="card">
        <h2 className="section-title">Permissões</h2>
        <p className="mt-3 text-sm">A equipe Redirect opera compras, recebimento, estoque, expedição e transporte. O admin New Store também pode cancelar uma reserva e liberar a unidade. Enviadas: {counts.sent}.</p>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="section-title">Últimas movimentações</h2>
        <table>
          <thead><tr><th>Unidade</th><th>Ação</th><th>Responsável</th><th>Data</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>#{event.unit_id}</td>
                <td>{event.action}</td>
                <td>{event.actor}</td>
                <td>{new Date(event.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!events.length ? <p className="py-4 text-muted">Nenhuma movimentação registrada.</p> : null}
      </section>
    </div>
  );
}
