import { eligibleOrder } from '@/lib/integracao';
import { advanceShipment } from './actions';
import { Field, recipientFields } from './ui';

export function ShipmentCard({ shipment, partner, mode }: { shipment: Record<string, any>; partner: boolean; mode: 'expedicao' | 'transporte' }) {
  const blocked = shipment.status !== 'enviado' && !eligibleOrder({
    delivered: shipment.delivered,
    commercial_status: shipment.commercial_status,
    tracking_code: shipment.order_tracking,
  });
  const suggested = String(Number(shipment.item_weight) + 200);
  return (
    <article className="card grid gap-3">
      <header className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="section-title">Pedido #{shipment.order_key} · unidade #{shipment.unit_id}</h3>
          <p>{shipment.model} · Série {shipment.serial_number}</p>
        </div>
        <span className="text-sm font-medium">{shipment.status === 'pendente' ? 'pendente de preparação' : shipment.status}</span>
      </header>
      {blocked ? <p className="text-danger">Pedido bloqueado para expedição. A New Store deve revisar a ficha.</p> : null}
      <details>
        <summary className="cursor-pointer text-sm underline">Destinatário e declaração conferidos</summary>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div>{recipientFields.map(([key, label]) => <p key={key}><span className="text-muted">{label}: </span>{shipment.recipient?.[key] || '—'}</p>)}</div>
          <div>
            <p>{shipment.customs_description}</p>
            <p>{shipment.declared_value} {shipment.currency} · HS {shipment.hs_code} · fabricação {shipment.origin_country}</p>
            {shipment.weight_g ? <p>Embalagem: {shipment.weight_g} g · {shipment.length_cm} × {shipment.width_cm} × {shipment.height_cm} cm</p> : null}
          </div>
        </div>
      </details>
      {mode === 'expedicao' && shipment.status === 'pendente' ? (
        <form action={advanceShipment}>
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <input type="hidden" name="next" value="preparando" />
          <input type="hidden" name="return_to" value="/integracao/expedicao" />
          <button>Iniciar preparação</button>
        </form>
      ) : null}
      {mode === 'expedicao' && shipment.status === 'preparando' ? (
        <form action={advanceShipment} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <input type="hidden" name="next" value="embalado" />
          <input type="hidden" name="return_to" value="/integracao/expedicao" />
          <Field name="serial_number" label="Conferir número de série" required />
          <button className="w-fit self-end">Confirmar embalagem</button>
        </form>
      ) : null}
      {mode === 'transporte' && shipment.status === 'embalado' ? (
        <form action={advanceShipment} className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <input type="hidden" name="next" value="enviado" />
          <input type="hidden" name="return_to" value="/integracao/transporte" />
          <Field name="weight_g" label="Peso final (g)" type="number" value={suggested} required />
          <Field name="length_cm" label="Comprimento (cm)" type="number" required />
          <Field name="width_cm" label="Largura (cm)" type="number" required />
          <Field name="height_cm" label="Altura (cm)" type="number" required />
          <Field name="tracking_code" label="Código de rastreio" required />
          <p className="md:col-span-5 text-xs text-muted">Peso sugerido: peso do relógio no cadastro mais 200 g de embalagem. Na faixa de 600 a 800 g, o acréscimo é de 200 g. Confirme o peso real.</p>
          <label className="md:col-span-5"><input type="checkbox" name="handover" required /> Pacote entregue à transportadora.</label>
          <button className="w-fit">Registrar envio</button>
        </form>
      ) : null}
      {shipment.status === 'enviado' ? <p className="text-sm">Rastreio: <strong>{shipment.tracking_code}</strong></p> : null}
      {!partner && shipment.status !== 'enviado' ? (
        <form action={advanceShipment}>
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <input type="hidden" name="next" value="cancelado" />
          <input type="hidden" name="return_to" value={mode === 'transporte' ? '/integracao/transporte' : '/integracao/expedicao'} />
          <button className="secondary">Cancelar reserva e liberar unidade</button>
        </form>
      ) : null}
    </article>
  );
}
