import Link from 'next/link';
import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';
import { eligibleOrder } from '@/lib/integracao';
import { receiveUnit, advanceShipment, relocateUnit } from './actions';

export default async function IntegracaoPage({searchParams}: {searchParams: Promise<{ok?:string;erro?:string;q?:string}>}) {
  const actor = await requireOperator();
  const params = await searchParams;
  const partner = actor.role === 'redirect';
  const sql = db();
  const [units, shipments, events] = await Promise.all([
    sql`select u.id, u.serial_number, u.weight_g, i.brand, i.model, i.location, i.status, i.order_id
      from ctl_integration_units u join ctl_integration_stock i on i.id = u.inventory_id
      where (${params.q || ''} = '' or i.model ilike ${`%${params.q || ''}%`} or u.serial_number ilike ${`%${params.q || ''}%`} or u.id::text = ${params.q || ''}) order by u.id desc limit 100`,
    sql`select s.*, u.serial_number, u.weight_g as item_weight, i.model, o.order_key, o.commercial_status, o.delivered, o.tracking_code as order_tracking
      from ctl_integration_shipments s join ctl_integration_units u on u.id = s.unit_id
      join ctl_integration_stock i on i.id = u.inventory_id join ctl_orders o on o.id = s.order_id
      where s.status <> 'cancelado' order by case when s.status = 'enviado' then 1 else 0 end, s.created_at desc limit 100`,
    sql`select e.id,e.unit_id,e.action,e.actor,e.created_at from ctl_integration_events e order by e.id desc limit 30`,
  ]);
  const counts = await sql`select count(*)::int as total, count(*) filter (where i.status = 'Disponível' and i.order_id is null)::int as available from ctl_integration_units u join ctl_integration_stock i on i.id=u.inventory_id`;
  return <div className="grid gap-6">
    <header><p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p><h1 className="page-title mt-2">Integração</h1><p className="text-muted">Plataforma Europa · recebimento, estoque e expedição.</p></header>
    {params.erro ? <p role="alert" className="card text-danger">{params.erro}</p> : null}
    {params.ok ? <p role="status" className="text-ok">Operação concluída.</p> : null}
    <div className="grid gap-3 sm:grid-cols-3">{[[counts[0].total,'Unidades recebidas'],[counts[0].available,'Disponíveis'],[shipments.filter(s=>s.status !== 'enviado').length,'Envios em preparação']].map(([n,label])=><div className="card" key={label}><p className="text-3xl">{n}</p><p className="text-sm text-muted">{label}</p></div>)}</div>
    <nav className="flex flex-wrap gap-4 text-sm underline"><a href="#recebimento">Recebimento</a><a href="#estoque">Estoque Europa</a><a href="#expedicao">Expedição</a><a href="#historico">Histórico</a></nav>
    <details id="recebimento" className="card"><summary className="section-title">Receber relógio</summary><p className="my-3 text-sm text-muted">O ID é gerado automaticamente. A unidade ficará disponível para a New Store solicitar um envio.</p>
      <form action={receiveUnit} className="grid gap-3 md:grid-cols-3">
        <Field name="brand" label="Marca"/><Field name="model" label="Modelo / referência" required/><Field name="serial_number" label="Número de série" required/>
        <Field name="location" label="Localização física" required/><Field name="weight_g" label="Peso do produto com caixa (g)" type="number" required/>
        <label>Foto da conferência<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required/><span className="text-xs">Até 4 MB</span></label>
        <label className="md:col-span-3">Observações<textarea name="notes" maxLength={2000}/></label><button className="w-fit">Cadastrar recebimento</button>
      </form>
    </details>
    <section id="estoque" className="card overflow-x-auto"><h2 className="section-title">Estoque Europa</h2><form className="my-3 flex gap-2"><input aria-label="Buscar unidade" name="q" defaultValue={params.q} placeholder="ID, série ou modelo"/><button className="secondary">Buscar</button></form>
      <table><thead><tr><th>ID / foto</th><th>Relógio / série</th><th>Localização</th><th>Peso</th><th>Status</th><th>Etiqueta</th></tr></thead><tbody>{units.map(u=><tr key={u.id}><td><a href={`/integracao/foto/${u.id}`} target="_blank" rel="noreferrer" className="underline">#{u.id} · Ver foto</a></td><td>{u.brand} {u.model}<p className="text-xs text-muted">Série: {u.serial_number}</p></td><td>{u.location}</td><td>{u.weight_g} g</td><td>{u.status}</td><td><Link className="underline" href={`/integracao/etiqueta/${u.id}`} target="_blank">Imprimir ID</Link></td></tr>)}</tbody></table>{!units.length ? <p className="py-4 text-muted">Nenhuma unidade encontrada.</p> : <p className="mt-3 text-xs text-muted">Até 100 unidades por consulta.</p>}
      <details className="mt-4"><summary className="cursor-pointer text-sm underline">Alterar localização de uma unidade</summary><form action={relocateUnit} className="mt-3 grid gap-3 md:grid-cols-3"><Field name="unit_id" label="ID da unidade" type="number" required/><Field name="location" label="Nova localização" required/><button>Salvar localização</button></form></details>
    </section>
    <section id="expedicao" className="grid gap-4"><h2 className="section-title">Expedição</h2><p className="text-sm text-muted">Etiquetas de transporte são emitidas no sistema atual. O rastreio registrado aqui atualiza o NSControle; o retorno à Tray e a emissão Sendcloud ainda não estão ativos.</p>
      {!shipments.length ? <div className="card text-muted">Nenhum envio atribuído à Redirect.</div> : null}
      {shipments.map(s=><article key={s.id} className="card grid gap-3"><header className="flex flex-wrap justify-between gap-2"><div><h3 className="section-title">Pedido #{s.order_key} · unidade #{s.unit_id}</h3><p>{s.model} · Série {s.serial_number}</p></div><span className="text-sm font-medium">{s.status}</span></header>
        {s.status !== 'enviado' && !eligibleOrder({delivered:s.delivered,commercial_status:s.commercial_status,tracking_code:s.order_tracking}) ? <p className="text-danger">Pedido bloqueado para expedição. A New Store deve revisar a ficha.</p> : null}
        <details><summary className="cursor-pointer text-sm underline">Destinatário e declaração conferidos</summary><div className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div>{recipientFields.map(([k,label])=><p key={k}><span className="text-muted">{label}: </span>{s.recipient[k] || '—'}</p>)}</div><div><p>{s.customs_description}</p><p>{s.declared_value} {s.currency} · HS {s.hs_code} · fabricação {s.origin_country}</p>{s.weight_g ? <p>Embalagem: {s.weight_g} g · {s.length_cm} × {s.width_cm} × {s.height_cm} cm</p> : null}</div></div></details>
        {s.status === 'pendente' ? <form action={advanceShipment}><input type="hidden" name="shipment_id" value={s.id}/><input type="hidden" name="next" value="preparando"/><button>Iniciar preparação</button></form> : null}
        {s.status === 'preparando' ? <form action={advanceShipment} className="grid gap-3 md:grid-cols-5"><input type="hidden" name="shipment_id" value={s.id}/><input type="hidden" name="next" value="embalado"/><Field name="serial_number" label="Conferir série" required/><Field name="weight_g" label="Peso final (g)" type="number" value={String(Number(s.item_weight)+200)} required/>{['length_cm','width_cm','height_cm'].map((k,i)=><Field key={k} name={k} label={['Comprimento (cm)','Largura (cm)','Altura (cm)'][i]} type="number" required/>)}<p className="md:col-span-5 text-xs text-muted">Peso sugerido: produto + 200 g. Confirme o peso real da embalagem.</p><button className="w-fit">Confirmar embalagem</button></form> : null}
        {s.status === 'embalado' ? <form action={advanceShipment} className="grid gap-3"><input type="hidden" name="shipment_id" value={s.id}/><input type="hidden" name="next" value="enviado"/><Field name="tracking_code" label="Código de rastreio da transportadora" required/><label><input type="checkbox" name="handover" required/> Pacote entregue à transportadora.</label><button className="w-fit">Registrar envio</button></form> : null}
        {s.status === 'enviado' ? <p className="text-sm">Rastreio: <strong>{s.tracking_code}</strong></p> : null}
        {!partner && s.status !== 'enviado' ? <form action={advanceShipment}><input type="hidden" name="shipment_id" value={s.id}/><input type="hidden" name="next" value="cancelado"/><button className="secondary">Cancelar reserva e liberar unidade</button></form> : null}
      </article>)}
    </section>
    <section id="historico" className="card overflow-x-auto"><h2 className="section-title">Últimas movimentações</h2><table><thead><tr><th>Unidade</th><th>Ação</th><th>Responsável</th><th>Data</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>#{e.unit_id}</td><td>{e.action}</td><td>{e.actor}</td><td>{new Date(e.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</td></tr>)}</tbody></table></section>
  </div>;
}

const recipientFields = [['name','Destinatário'],['address','Rua'],['number','Número'],['complement','Complemento'],['city','Cidade'],['state','Estado'],['postal_code','CEP'],['country','País (ISO)'],['phone','Telefone'],['tax_id','CPF/CNPJ']];
function Field({name,label,required=false,type='text',value}: {name:string;label:string;required?:boolean;type?:string;value?:string}) {
  return <label className="grid gap-1">{label}<input name={name} type={type} required={required} defaultValue={value} maxLength={type==='text' ? 500 : undefined} min={type==='number' ? 1 : undefined} step={type==='number' ? 'any' : undefined}/></label>;
}
