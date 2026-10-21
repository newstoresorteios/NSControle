"use server";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTeam } from '@/lib/auth';
import { db } from '@/lib/db';
import { decimal, integer, text } from '@/lib/form';
import { eligibleOrder, recipientValid, trayRecipient, type Recipient } from '@/lib/integracao';
import { trayGet } from '@/lib/tray-client';
const uuid = (value: string | null) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
function finish(data: FormData, error?: string): never {
  const id = text(data,'order_id');
  if (!uuid(id)) redirect('/pedidos');
  if (!error) for (const url of ['/estoque','/pedidos']) revalidatePath(url,'layout');
  redirect('/pedidos/' + id + '/envio?' + (error ? 'erro=' + encodeURIComponent(error) : 'ok=1'));
}
export async function refreshRecipient(data: FormData) {
  await requireTeam();
  const id = text(data,'order_id');
  try {
    if (!uuid(id)) throw new Error();
    const sql = db();
    const [order] = await sql`select order_key from ctl_orders where id = ${id!}`;
    if (!order || !/^\d+$/.test(order.order_key)) throw new Error();
    const payload = await trayGet(`/internal/orders/${order.order_key}/complete`);
    await sql`insert into ctl_integration_order_data(order_id, recipient) values (${id!}, ${sql.json(trayRecipient(payload))})
      on conflict (order_id) do update set recipient = excluded.recipient, updated_at = now()`;
  } catch { finish(data,'Não foi possível consultar o destinatário na Tray. Verifique a conexão e o número do pedido.'); }
  revalidatePath('/pedidos/' + id + '/envio');
  redirect(`/pedidos/${id}/envio?ok=1`);
}

export async function reserveUnit(data: FormData) {
  const actor = await requireTeam();
  try {
    const orderId = text(data,'order_id'), unitId = integer(data,'unit_id');
    const recipient = Object.fromEntries(['name','address','number','complement','city','state','postal_code','country','phone','tax_id'].map(k => [k,text(data,k) || ''])) as Recipient;
    const value = decimal(data,'declared_value'), description = text(data,'customs_description'), hs = text(data,'hs_code'), origin = text(data,'origin_country'), currency = text(data,'currency');
    if (!uuid(orderId) || !unitId || !recipientValid(recipient) || !description || !value || value <= 0 || !/^\d{6,10}$/.test(hs || '') || !/^[A-Z]{2}$/.test(origin || '') || !['EUR','USD','BRL'].includes(currency || '') || data.get('confirmed') !== 'on') throw new Error('Confira destinatário, declaração e confirmação dos dados.');
    await db().begin(async sql => {
      const [order] = await sql`select * from ctl_orders where id = ${orderId!} for update`;
      if (!order || !eligibleOrder(order as {delivered:boolean;commercial_status:string|null;tracking_code:string|null})) throw new Error('O pedido precisa estar a enviar, sem rastreio e sem entrega registrada.');
      const [unit] = await sql`select u.id, i.id as inventory_id, i.status, i.order_id from ctl_integration_units u join ctl_integration_stock i on i.id = u.inventory_id where u.id = ${unitId} for update of u, i`;
      if (!unit || unit.status !== 'Disponível' || unit.order_id) throw new Error('A unidade já está reservada ou indisponível.');
      const [shipment] = await sql`insert into ctl_integration_shipments (unit_id,order_id,recipient,customs_description,declared_value,currency,hs_code,origin_country,created_by)
        values (${unitId},${orderId!},${sql.json(recipient)},${description},${value},${currency!},${hs!},${origin!},${actor.email}) returning id`;
      await sql`update ctl_integration_stock set status = 'Reservado', order_id = ${orderId!} where id = ${unit.inventory_id}`;
      await sql`insert into ctl_integration_events(unit_id,shipment_id,action,actor) values (${unitId},${shipment.id},'Reservado para expedição',${actor.email})`;
    });
  } catch (error) { finish(data,error instanceof Error && !('code' in error) ? error.message : 'Pedido ou unidade já possui um envio. Atualize a página.'); }
  finish(data);
}

export async function cancelShipment(data:FormData) {
  const actor=await requireTeam();
  const orderId=text(data,'order_id'), shipmentId=text(data,'shipment_id');
  try {
    if (!uuid(orderId) || !uuid(shipmentId)) throw new Error();
    await db().begin(async sql=>{
      const [shipment]=await sql`select s.id,s.unit_id,s.status,u.inventory_id from ctl_integration_shipments s join ctl_integration_units u on u.id=s.unit_id where s.id=${shipmentId!} and s.order_id=${orderId!} for update of s,u`;
      if (!shipment || !['pendente','preparando','embalado'].includes(shipment.status)) throw new Error();
      await sql`update ctl_integration_shipments set status='cancelado',updated_at=now() where id=${shipmentId!}`;
      await sql`update ctl_integration_stock set status='Disponível',order_id=null where id=${shipment.inventory_id}`;
      await sql`insert into ctl_integration_events(unit_id,shipment_id,action,actor) values (${shipment.unit_id},${shipmentId!},'Cancelado pela New Store',${actor.email})`;
    });
  } catch { finish(data,'Não foi possível cancelar. O envio pode ter sido concluído pela Redirect.'); }
  finish(data);
}

