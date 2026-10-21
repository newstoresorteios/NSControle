import Link from 'next/link';
import { requireTeam } from '@/lib/auth';
import { db } from '@/lib/db';
import { eligibleOrder, type Recipient } from '@/lib/integracao';
import { receiveUnit, reserveUnit, refreshRecipient, advanceShipment, relocateUnit } from './actions';

export default async function IntegracaoPage({searchParams}: {searchParams: Promise<{pedido?:string;ok?:string;erro?:string;q?:string}>}) {
  const actor = await requireTeam(true);
  const params = await searchParams;
  const partner = actor.role === 'redirect';
  const sql = db();
  const [units, shipments, orders, events] = await Promise.all([
    sql`select u.id, u.serial_number, u.weight_g, i.brand, i.model, i.location, i.status, i.order_id
      from ctl_integration_units u join ctl_inventory_items i on i.id = u.inventory_id
      where (${params.q || ''} = '' or i.model ilike ${`%${params.q || ''}%`} or u.serial_number ilike ${`%${params.q || ''}%`} or u.id::text = ${params.q || ''}) order by u.id desc limit 100`,
    sql`select s.*, u.serial_number, u.weight_g as item_weight, i.model, o.order_key, o.commercial_status, o.delivered, o.tracking_code as order_tracking
      from ctl_integration_shipments s join ctl_integration_units u on u.id = s.unit_id
      join ctl_inventory_items i on i.id = u.inventory_id join ctl_orders o on o.id = s.order_id
      where s.status <> 'cancelado' order by case when s.status = 'enviado' then 1 else 0 end, s.created_at desc limit 100`,
    partner ? Promise.resolve([]) : sql`select o.id, o.order_key, o.product_name, o.reference, o.commercial_status, o.delivered, o.tracking_code, d.recipient
      from ctl_orders o left join ctl_integration_order_data d on d.order_id = o.id
      where not o.delivered and coalesce(o.tracking_code,'') = ''
        and upper(trim(o.commercial_status)) in ('A ENVIAR','A ENVIAR VINDI')
        and not exists (select 1 from ctl_integration_shipments s where s.order_id = o.id and s.status <> 'cancelado')
      order by o.created_at desc`,
    sql`select e.id,e.unit_id,e.action,e.actor,e.created_at from ctl_integration_events e order by e.id desc limit 30`,
  ]);
  const selected = orders.find(o => o.id === params.pedido);
  const recipient = (selected?.recipient || {}) as Partial<Recipient>;
  const reservable = partner ? [] : await sql`select u.id,u.serial_number,i.model,i.location from ctl_integration_units u join ctl_inventory_items i on i.id=u.inventory_id where i.status='Disponível' and i.order_id is null order by u.id`;
  const counts = await sql`select count(*)::int as total, count(*) filter (where i.status = 'Disponível' and i.order_id is null)::int as available from ctl_integration_units u join ctl_inventory_items i on i.id=u.inventory_id`;
  return <div className="grid gap-6">
    <header><p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p><h1 className="page-title mt-2">Integração</h1><p className="text-muted">Recebimento, estoque por unidade e expedição conectados ao NSControle.</p></header>
    {params.erro ? <p role="alert" className="card text-danger">{params.erro}</p> : null}
    {params.ok ? <p role="status" className="text-ok">Operação concluída.</p> : null}
    <div className="grid gap-3 sm:grid-cols-3">{[[counts[0].total,'Unidades recebidas'],[counts[0].available,'Disponíveis'],[shipments.filter(s=>s.status !== 'enviado').length,'Envios em preparação']].map(([n,label])=><div className="card" key={label}><p className="text-3xl">{n}</p><p className="text-sm text-muted">{label}</p></div>)}</div>
    <nav className="flex flex-wrap gap-4 text-sm underline"><a href="#recebimento">Recebimento</a><a href="#estoque">Estoque Europa</a>{!partner ? <a href="#pedidos">Selecionar envio</a> : null}<a href="#expedicao">Expedição</a><a href="#historico">Histórico</a></nav>
    <details id="recebimento" className="card"><summary className="section-title">Receber relógio</summary><p className="my-3 text-sm text-muted">O ID é gerado automaticamente. A peça também aparece no estoque do NSControle.</p>
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
    {!partner ? <section id="pedidos" className="card"><h2 className="section-title">Selecionar unidade para envio</h2><p className="my-3 text-sm text-muted">Pedidos do NSControle em “A enviar”, sem rastreio. Um envio por pedido nesta etapa.</p>
      <form method="get" className="flex flex-wrap gap-3"><select aria-label="Pedido" name="pedido" defaultValue={selected?.id || ''} required><option value="">Selecione o pedido</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.order_key} · {o.product_name || o.reference || 'Produto não informado'}</option>)}</select><button className="secondary">Abrir pedido</button></form>
      {selected ? <div className="mt-5 grid gap-4"><div className="flex flex-wrap items-center gap-4"><Link className="underline text-sm" href={`/pedidos/${selected.id}`}>Abrir ficha no NSControle</Link><form action={refreshRecipient}><input type="hidden" name="order_id" value={selected.id}/><button className="secondary">Buscar endereço na Tray</button></form></div>
        <form key={selected.id + JSON.stringify(recipient)} action={reserveUnit} className="grid gap-3 md:grid-cols-3"><input type="hidden" name="order_id" value={selected.id}/>
          <label className="md:col-span-3">Unidade física<select name="unit_id" required><option value="">Selecione pelo ID e confira modelo e série</option>{reservable.map(u=><option key={u.id} value={u.id}>#{u.id} · {u.model} · série {u.serial_number} · {u.location}</option>)}</select></label>
          {recipientFields.map(([name,label])=><Field key={name} name={name} label={label} value={recipient[name as keyof Recipient] || (name==='country' ? 'BR' : '')} required={name !== 'complement'}/>)}
          <Field name="customs_description" label="Descrição aduaneira" required/><Field name="declared_value" label="Valor declarado real" type="number" required/><label>Moeda<select name="currency"><option>EUR</option><option>USD</option><option>BRL</option></select></label>
          <Field name="hs_code" label="Código HS (6 a 10 dígitos)" required/><Field name="origin_country" label="País de fabricação (ex.: CH)" required/>
          <label className="md:col-span-3"><input type="checkbox" name="confirmed" required/> Conferi pagamento/status comercial, modelo, unidade, endereço e dados aduaneiros.</label><button className="w-fit" disabled={!reservable.length}>Reservar e liberar para preparação</button>
        </form>
      </div> : <p className="mt-4 text-sm text-muted">Selecione um pedido para conferir os dados e reservar a unidade.</p>}
    </section> : null}
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
