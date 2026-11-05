import { requireOperator } from '@/lib/auth';
import { ShipmentCard } from '../shipment-card';
import { loadShipments } from '../shipments';
import { Notice } from '../ui';

export default async function ExpedicaoPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const actor = await requireOperator();
  const params = await searchParams;
  const shipments = await loadShipments(['pendente', 'preparando']);
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p>
        <h1 className="page-title mt-2">Expedição</h1>
        <p className="text-muted">O pedido entra sozinho como pendente de preparação. Separe, confira o número de série e embale.</p>
      </header>
      <Notice ok={params.ok} erro={params.erro} />
      {!shipments.length ? <div className="card text-muted">Nenhum pedido pendente de preparação.</div> : null}
      {shipments.map((shipment) => (
        <ShipmentCard key={shipment.id} shipment={shipment} partner={actor.role === 'redirect'} mode="expedicao" />
      ))}
    </div>
  );
}
