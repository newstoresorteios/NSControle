import { eligibleOrder, suggestedParcelGrams } from '@/lib/integracao';
import { advanceShipment, issueLabel } from './actions';
import { Field, recipientFields } from './ui';

export function ShipmentCard({ shipment, partner, mode }: { shipment: Record<string, any>; partner: boolean; mode: 'expedicao' | 'transporte' }) {
  const ownTracking = Boolean(shipment.tracking_code) && shipment.order_tracking === shipment.tracking_code;
  const blocked = shipment.status !== 'enviado' && !ownTracking && !eligibleOrder({
    delivered: shipment.delivered,
    commercial_status: shipment.commercial_status,
    tracking_code: shipment.order_tracking,
  });
  const suggested = suggestedParcelGrams(Number(shipment.item_weight));
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
      {mode === 'transporte' && shipment.status === 'embalado' && !shipment.tracking_code ? (
        <form action={issueLabel} className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <Field name="weight_g" label="Peso final (g)" type="number" value={suggested ? String(suggested) : ""} required />
          <Field name="length_cm" label="Comprimento (cm)" type="number" required />
          <Field name="width_cm" label="Largura (cm)" type="number" required />
          <Field name="height_cm" label="Altura (cm)" type="number" required />
          <p className="md:col-span-5 text-xs text-muted">Entre 600 e 800 g, a sugestão soma 200 g de embalagem. Fora dessa faixa, confirme o peso da embalagem. A etiqueta usa o destinatário e a declaração já conferidos.</p>
          {shipment.label_error ? <p className="md:col-span-5 text-danger" role="alert">{shipment.label_error}</p> : null}
          <button className="w-fit">Gerar etiqueta</button>
        </form>
      ) : null}
      {mode === 'transporte' && shipment.status === 'embalado' && shipment.tracking_code ? (
        <form action={advanceShipment} className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <input type="hidden" name="next" value="enviado" />
          <input type="hidden" name="return_to" value="/integracao/transporte" />
          <Field name="weight_g" label="Peso final (g)" type="number" value={shipment.weight_g ? String(shipment.weight_g) : suggested ? String(suggested) : ""} required />
          <Field name="length_cm" label="Comprimento (cm)" type="number" value={shipment.length_cm ? String(shipment.length_cm) : ""} required />
          <Field name="width_cm" label="Largura (cm)" type="number" value={shipment.width_cm ? String(shipment.width_cm) : ""} required />
          <Field name="height_cm" label="Altura (cm)" type="number" value={shipment.height_cm ? String(shipment.height_cm) : ""} required />
          <Field name="tracking_code" label="Código de rastreio" value={shipment.tracking_code || ""} required />
          <label className="md:col-span-5"><input type="checkbox" name="handover" required /> Pacote entregue à transportadora.</label>
          <button className="w-fit">Confirmar entrega à transportadora</button>
        </form>
      ) : null}
      {mode === 'transporte' && shipment.status === 'embalado' && !shipment.tracking_code ? (
        <details>
          <summary className="cursor-pointer text-sm underline">Registrar rastreio sem etiqueta</summary>
          <form action={advanceShipment} className="mt-3 grid gap-3 md:grid-cols-5">
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <input type="hidden" name="next" value="enviado" />
            <input type="hidden" name="return_to" value="/integracao/transporte" />
            <Field name="weight_g" label="Peso final (g)" type="number" value={suggested ? String(suggested) : ""} required />
            <Field name="length_cm" label="Comprimento (cm)" type="number" required />
            <Field name="width_cm" label="Largura (cm)" type="number" required />
            <Field name="height_cm" label="Altura (cm)" type="number" required />
            <Field name="tracking_code" label="Código de rastreio" required />
            <label className="md:col-span-5"><input type="checkbox" name="handover" required /> Pacote entregue à transportadora.</label>
            <button className="w-fit">Confirmar entrega à transportadora</button>
          </form>
        </details>
      ) : null}
      {shipment.label_ready ? <p className="text-sm"><a href={`/integracao/transporte/etiqueta/${shipment.id}`}>Imprimir etiqueta</a></p> : null}
      {shipment.tracking_code ? <p className="text-sm">Rastreio: <strong>{shipment.tracking_code}</strong></p> : null}
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
