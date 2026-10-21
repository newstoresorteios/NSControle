import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeam } from '@/lib/auth';
import { db } from '@/lib/db';
import { eligibleOrder, type Recipient } from '@/lib/integracao';
import { reserveUnit, refreshRecipient, cancelShipment } from './actions';

export default async function EuropaOrder({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{ok?:string;erro?:string}>}) {
  await requireTeam();
  const {id}=await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query=await searchParams;
  const sql=db();
  const [[order],units,shipments]=await Promise.all([
    sql`select o.id,o.order_key,o.product_name,o.reference,o.delivered,o.tracking_code,o.commercial_status,d.recipient from ctl_orders o left join ctl_integration_order_data d on d.order_id=o.id where o.id=${id}`,
    sql`select u.id,u.serial_number,i.model,i.location from ctl_integration_units u join ctl_integration_stock i on i.id=u.inventory_id where i.status='Disponível' and i.order_id is null order by u.id`,
    sql`select s.id,s.unit_id,s.status,s.tracking_code,s.updated_at from ctl_integration_shipments s where s.order_id=${id} order by s.created_at desc`,
  ]);
  if (!order) notFound();
  const recipient=(order.recipient || {}) as Partial<Recipient>;
  const active=shipments.find(s=>s.status!=='cancelado');
  const eligible=eligibleOrder(order as {delivered:boolean;tracking_code:string|null;commercial_status:string|null});
  return <div className="grid gap-5"><header><Link href={`/pedidos/${id}`} className="text-sm underline">Voltar ao pedido</Link><h1 className="page-title mt-3">Envio Europa · #{order.order_key}</h1><p className="text-muted">{order.product_name || order.reference}</p></header>
    <p className="card text-sm text-muted">A Redirect recebe e prepara os envios na plataforma Europa, em um sistema separado. Aqui, o time New Store seleciona a unidade e encaminha este pedido.</p>
    {query.erro ? <p role="alert" className="text-danger">{query.erro}</p> : null}{query.ok ? <p role="status" className="text-ok">Dados atualizados.</p> : null}
    {shipments.length ? <section className="card"><h2 className="section-title">Acompanhamento do envio</h2>{shipments.map(s=><div key={s.id} className="mt-3 flex flex-wrap items-center gap-4"><p>Unidade #{s.unit_id} · {s.status}{s.tracking_code ? ` · ${s.tracking_code}` : ''}</p>{s.status!=='cancelado' && s.status!=='enviado' ? <form action={cancelShipment}><input type="hidden" name="order_id" value={id}/><input type="hidden" name="shipment_id" value={s.id}/><button className="secondary">Cancelar reserva</button></form> : null}</div>)}</section> : null}
    {!active && eligible ? <section className="card"><h2 className="section-title">Encaminhar para preparação na Europa</h2><form action={refreshRecipient} className="my-4"><input type="hidden" name="order_id" value={id}/><button className="secondary">Buscar endereço na Tray</button></form><form key={JSON.stringify(recipient)} action={reserveUnit} className="grid gap-3 md:grid-cols-3"><input type="hidden" name="order_id" value={id}/><label className="md:col-span-3">Unidade física disponível na Europa<select name="unit_id" required><option value="">Selecione ID, modelo e série</option>{units.map(u=><option key={u.id} value={u.id}>#{u.id} · {u.model} · série {u.serial_number} · {u.location}</option>)}</select></label>{recipientFields.map(([name,label])=><Field key={name} name={name} label={label} value={recipient[name as keyof Recipient] || (name==='country'?'BR':'')} required={name!=='complement'}/>)}<Field name="customs_description" label="Descrição aduaneira" required/><Field name="declared_value" label="Valor declarado real" type="number" required/><label>Moeda<select name="currency"><option>EUR</option><option>USD</option><option>BRL</option></select></label><Field name="hs_code" label="HS (6 a 10 dígitos)" required/><Field name="origin_country" label="País de fabricação (ISO)" required/><label className="md:col-span-3"><input name="confirmed" type="checkbox" required/> Conferi pagamento, modelo, unidade, endereço e declaração.</label><button className="w-fit" disabled={!units.length}>Encaminhar à Redirect</button>{!units.length ? <p className="text-muted text-sm">Aguardando recebimento de unidades na plataforma Europa.</p> : null}</form></section> : !active ? <p className="card text-muted">Pedido indisponível para encaminhamento: exige status “A enviar”, sem entrega ou rastreio registrado.</p> : null}
  </div>;
}
const recipientFields=[['name','Destinatário'],['address','Rua'],['number','Número'],['complement','Complemento'],['city','Cidade'],['state','Estado'],['postal_code','CEP'],['country','País (ISO)'],['phone','Telefone'],['tax_id','CPF/CNPJ']];
function Field({name,label,value,required=false,type='text'}:{name:string;label:string;value?:string;required?:boolean;type?:string}) {
  return <label>{label}<input name={name} type={type} defaultValue={value} required={required} min={type==='number'?1:undefined} step={type==='number'?'any':undefined}/></label>;
}
