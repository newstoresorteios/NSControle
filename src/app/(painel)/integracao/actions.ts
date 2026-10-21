"use server";

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTeam } from '@/lib/auth';
import { db } from '@/lib/db';
import { decimal, integer, text } from '@/lib/form';
import { eligibleOrder, recipientValid, transitionAllowed, trayRecipient, type Recipient } from '@/lib/integracao';
import { trayGet } from '@/lib/tray-client';

function finish(error?: string): never {
  if (!error) for (const path of ['/integracao','/estoque','/pedidos']) revalidatePath(path, 'layout');
  redirect(`/integracao?${error ? `erro=${encodeURIComponent(error)}` : 'ok=1'}`);
}
const uuid = (value: string | null) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

export async function receiveUnit(data: FormData) {
  const actor = await requireTeam(true);
  try {
    const model = text(data,'model'), serial = text(data,'serial_number'), location = text(data,'location');
    const weight = integer(data,'weight_g'), photo = data.get('photo');
    if (!model || !serial || !location || !weight || weight <= 0) throw new Error('Informe modelo, série, localização e peso positivo.');
    if (!(photo instanceof File) || !photo.size || photo.size > 4 * 1024 * 1024) throw new Error('Anexe uma foto de até 4 MB.');
    const bytes = Buffer.from(await photo.arrayBuffer());
    const type = bytes.subarray(0,3).equals(Buffer.from([255,216,255])) ? 'image/jpeg'
      : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null;
    if (!type) throw new Error('Use uma foto JPEG, PNG ou WebP.');
    await db().begin(async sql => {
      const [item] = await sql`insert into ctl_inventory_items (brand, model, origin, location, status, notes)
        values (${text(data,'brand')}, ${model}, 'Redirect Europa', ${location}, 'Disponível', ${text(data,'notes')}) returning id`;
      const [unit] = await sql`insert into ctl_integration_units (inventory_id, serial_number, weight_g, photo, photo_type, created_by)
        values (${item.id}, ${serial}, ${weight}, ${bytes}, ${type}, ${actor.email}) returning id`;
      await sql`insert into ctl_integration_events (unit_id, action, actor) values (${unit.id}, 'Recebimento', ${actor.email})`;
    });
  } catch (error) {
    if ((error as {code?: string}).code === '23505') finish('Esta série já foi recebida.');
    finish(error instanceof Error && !('code' in error) ? error.message : 'Não foi possível receber a unidade.');
  }
  finish();
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
  } catch { finish('Não foi possível consultar o destinatário na Tray. Verifique a conexão e o número do pedido.'); }
  revalidatePath('/integracao');
  redirect(`/integracao?pedido=${encodeURIComponent(id!)}&ok=1#pedidos`);
}

export async function relocateUnit(data: FormData) {
  const actor = await requireTeam(true);
  try {
    const id = integer(data,'unit_id'), location = text(data,'location');
    if (!id || !location || location.length > 200) throw new Error();
    await db().begin(async sql => {
      const [unit] = await sql`select u.inventory_id,i.location,i.status from ctl_integration_units u join ctl_inventory_items i on i.id=u.inventory_id where u.id=${id} for update of i`;
      if (!unit || unit.status === 'Enviado') throw new Error();
      await sql`update ctl_inventory_items set location=${location} where id=${unit.inventory_id}`;
      await sql`insert into ctl_integration_events(unit_id,action,actor) values (${id},${`Localização: ${unit.location || '—'} → ${location}`},${actor.email})`;
    });
  } catch { finish('Não foi possível alterar a localização. Confira a unidade e o local informado.'); }
  finish();
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
      const [unit] = await sql`select u.id, i.id as inventory_id, i.status, i.order_id from ctl_integration_units u join ctl_inventory_items i on i.id = u.inventory_id where u.id = ${unitId} for update of u, i`;
      if (!unit || unit.status !== 'Disponível' || unit.order_id) throw new Error('A unidade já está reservada ou indisponível.');
      const [shipment] = await sql`insert into ctl_integration_shipments (unit_id,order_id,recipient,customs_description,declared_value,currency,hs_code,origin_country,created_by)
        values (${unitId},${orderId!},${sql.json(recipient)},${description},${value},${currency!},${hs!},${origin!},${actor.email}) returning id`;
      await sql`update ctl_inventory_items set status = 'Reservado', order_id = ${orderId!} where id = ${unit.inventory_id}`;
      await sql`insert into ctl_integration_events(unit_id,shipment_id,action,actor) values (${unitId},${shipment.id},'Reservado para expedição',${actor.email})`;
    });
  } catch (error) { finish(error instanceof Error && !('code' in error) ? error.message : 'Pedido ou unidade já possui um envio. Atualize a página.'); }
  finish();
}

export async function advanceShipment(data: FormData) {
  const actor = await requireTeam(true);
  try {
    const id = text(data,'shipment_id'), next = text(data,'next') || '';
    if (!uuid(id) || (next === 'cancelado' && actor.role !== 'newstore')) throw new Error('Ação não permitida.');
    await db().begin(async sql => {
      const [shipment] = await sql`select s.*, u.inventory_id, u.serial_number from ctl_integration_shipments s join ctl_integration_units u on u.id = s.unit_id where s.id = ${id!} for update of s, u`;
      if (!shipment || !transitionAllowed(shipment.status,next)) throw new Error('O envio mudou de etapa. Atualize a página.');
      const [order] = await sql`select * from ctl_orders where id = ${shipment.order_id} for update`;
      if (next !== 'cancelado' && !eligibleOrder(order as {delivered:boolean;commercial_status:string|null;tracking_code:string|null})) throw new Error('Pedido bloqueado: confira status comercial, entrega e rastreio no NSControle.');
      if (next === 'embalado') {
        const weight = integer(data,'weight_g'), length = decimal(data,'length_cm'), width = decimal(data,'width_cm'), height = decimal(data,'height_cm');
        if (text(data,'serial_number') !== shipment.serial_number || !weight || weight <= 0 || !length || length <= 0 || !width || width <= 0 || !height || height <= 0) throw new Error('Confira a série e informe peso e dimensões positivos.');
        await sql`update ctl_integration_shipments set weight_g = ${weight}, length_cm = ${length}, width_cm = ${width}, height_cm = ${height} where id = ${id!}`;
      }
      if (next === 'enviado') {
        const tracking = text(data,'tracking_code');
        if (!tracking || !/^[A-Za-z0-9-]{6,60}$/.test(tracking) || data.get('handover') !== 'on') throw new Error('Informe o rastreio e confirme a entrega à transportadora.');
        await sql`update ctl_integration_shipments set tracking_code = ${tracking} where id = ${id!}`;
        await sql`update ctl_orders set tracking_code = ${tracking}, tracking_situation = 'Em trânsito' where id = ${shipment.order_id}`;
        await sql`update ctl_inventory_items set tracking_code = ${tracking}, status = 'Enviado' where id = ${shipment.inventory_id}`;
      }
      if (next === 'cancelado') await sql`update ctl_inventory_items set status = 'Disponível', order_id = null where id = ${shipment.inventory_id}`;
      await sql`update ctl_integration_shipments set status = ${next}, updated_at = now() where id = ${id!}`;
      await sql`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${shipment.unit_id},${id!},${next},${actor.email})`;
    });
  } catch (error) { finish(error instanceof Error && !('code' in error) ? error.message : 'Não foi possível atualizar o envio.'); }
  finish();
}
