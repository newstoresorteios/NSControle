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
        <h1 className="page-title">Transporte</h1>
        <p className="text-muted">Depois de embalado, informe peso e dimensões e gere a etiqueta. O rastreio volta para o pedido e, quando a loja está ligada, também para a Tray. Se a emissão falhar, o erro fica neste volume e o rastreio pode ser registrado manualmente.</p>
      </header>
      <Notice ok={params.ok} erro={params.erro} />
      {!shipments.length ? <div className="card text-muted">Nenhum volume embalado ou enviado.</div> : null}
      {shipments.map((shipment) => (
        <ShipmentCard key={shipment.id} shipment={shipment} partner={actor.role === 'redirect'} mode="transporte" />
      ))}
    </div>
  );
}
