import { requireOperator } from '@/lib/auth';
import { ShipmentCard } from '../shipment-card';
import { loadShipments } from '../shipments';
import { Notice } from '../ui';

export default async function TransportePage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const actor = await requireOperator();
  const params = await searchParams;
  const shipments = await loadShipments(['embalado', 'enviado']);
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p>
        <h1 className="page-title mt-2">Transporte</h1>
        <p className="text-muted">Depois de embalado, informe destinatário, peso e dimensões e registre o rastreio. O código volta para o pedido no NSControle. A etiqueta da Sendcloud e o aviso ao cliente na Tray ainda não são emitidos por aqui.</p>
      </header>
      <Notice ok={params.ok} erro={params.erro} />
      {!shipments.length ? <div className="card text-muted">Nenhum volume embalado ou enviado.</div> : null}
      {shipments.map((shipment) => (
        <ShipmentCard key={shipment.id} shipment={shipment} partner={actor.role === 'redirect'} mode="transporte" />
      ))}
    </div>
  );
}
