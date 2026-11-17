"use server";

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';
import { decimal, integer, text } from '@/lib/form';
import { eligibleOrder, transitionAllowed } from '@/lib/integracao';
import { announceParcel } from '@/lib/sendcloud';
import { pushTracking } from '@/lib/tray-shipping';

const returnTo = new Set(['/integracao', '/integracao/estoque', '/integracao/pedidos', '/integracao/expedicao', '/integracao/transporte', '/integracao/controle']);

function finish(path: string, error?: string): never {
  const target = returnTo.has(path) ? path : '/integracao';
  if (!error) revalidatePath('/integracao', 'layout');
  redirect(`${target}?${error ? `erro=${encodeURIComponent(error)}` : 'ok=1'}`);
}

function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const uuid = (value: string | null) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

export async function receiveUnit(data: FormData) {
  const actor = await requireOperator();
  try {
    const model = text(data,'model'), serial = text(data,'serial_number'), location = text(data,'location');
    const weight = integer(data,'weight_g');
    const files = data.getAll('photos').filter((file): file is File => file instanceof File && file.size > 0);
    if (!model || !serial || !location || !weight || weight <= 0) throw new Error('Informe modelo, série, localização e peso positivo.');
    if (!files.length || files.length > 8) throw new Error('Anexe de 1 a 8 fotos.');
    if (files.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) throw new Error('O conjunto de fotos pode ter até 8 MB.');
    const images: { bytes: Buffer; type: string }[] = [];
    for (const file of files) {
      if (file.size > 4 * 1024 * 1024) throw new Error('Cada foto pode ter até 4 MB.');
      const bytes = Buffer.from(await file.arrayBuffer());
      const type = imageType(bytes);
      if (!type) throw new Error('Use fotos JPEG, PNG ou WebP.');
      images.push({ bytes, type });
    }
    const cover = images[0];
    if (!cover) throw new Error('Anexe de 1 a 8 fotos.');
    await db().begin(async sql => {
      const [item] = await sql`insert into ctl_integration_stock (brand, model, origin, location, status, notes)
        values (${text(data,'brand')}, ${model}, 'Redirect Europa', ${location}, 'Disponível', ${text(data,'notes')}) returning id`;
      const [unit] = await sql`insert into ctl_integration_units (inventory_id, serial_number, weight_g, photo, photo_type, created_by)
        values (${item.id}, ${serial}, ${weight}, ${cover.bytes}, ${cover.type}, ${actor.email}) returning id`;
      for (let position = 0; position < images.length; position += 1) {
        const image = images[position];
        await sql`insert into ctl_integration_unit_photos (unit_id, position, photo, photo_type)
          values (${unit.id}, ${position}, ${image.bytes}, ${image.type})`;
      }
      await sql`insert into ctl_integration_events (unit_id, action, actor) values (${unit.id}, 'Recebimento', ${actor.email})`;
    });
  } catch (error) {
    if ((error as {code?: string}).code === '23505') finish('/integracao', 'Esta série já foi recebida.');
    finish('/integracao', error instanceof Error && !('code' in error) ? error.message : 'Não foi possível receber a unidade.');
  }
  finish('/integracao');
}

export async function relocateUnit(data: FormData) {
  const actor = await requireOperator();
  try {
    const id = integer(data,'unit_id'), location = text(data,'location');
    if (!id || !location || location.length > 200) throw new Error();
    await db().begin(async sql => {
      const [unit] = await sql`select u.inventory_id,i.location,i.status from ctl_integration_units u join ctl_integration_stock i on i.id=u.inventory_id where u.id=${id} for update of i`;
      if (!unit || unit.status === 'Enviado') throw new Error();
      await sql`update ctl_integration_stock set location=${location} where id=${unit.inventory_id}`;
      await sql`insert into ctl_integration_events(unit_id,action,actor) values (${id},${`Localização: ${unit.location || '—'} → ${location}`},${actor.email})`;
    });
  } catch { finish('/integracao/estoque', 'Não foi possível alterar a localização. Confira a unidade e o local informado.'); }
  finish('/integracao/estoque');
}

export async function advanceShipment(data: FormData) {
  const actor = await requireOperator();
  const back = text(data, 'return_to') === '/integracao/transporte' ? '/integracao/transporte' : '/integracao/expedicao';
  try {
    const id = text(data,'shipment_id'), next = text(data,'next') || '';
    if (!uuid(id) || (next === 'cancelado' && actor.role !== 'newstore')) throw new Error('Ação não permitida.');
    const handed = await db().begin(async sql => {
      let note: { unitId: number; orderKey: string; tracking: string } | null = null;
      const [shipment] = await sql`select s.id, s.unit_id, s.order_id, s.status, u.inventory_id, u.serial_number from ctl_integration_shipments s join ctl_integration_units u on u.id = s.unit_id where s.id = ${id!} for update of s, u`;
      if (!shipment || !transitionAllowed(shipment.status,next)) throw new Error('O envio mudou de etapa. Atualize a página.');
      const [order] = await sql`select order_key, delivered, commercial_status, tracking_code from ctl_orders where id = ${shipment.order_id} for update`;
      const confirmingLabel = next === 'enviado' && Boolean(order?.tracking_code) && order.tracking_code === text(data, 'tracking_code');
      if (next !== 'cancelado' && !confirmingLabel && !eligibleOrder(order as {delivered:boolean;commercial_status:string|null;tracking_code:string|null})) throw new Error('Pedido bloqueado: confira status comercial, entrega e rastreio no NSControle.');
      if (next === 'embalado') {
        if (text(data,'serial_number') !== shipment.serial_number) throw new Error('A série conferida não é a desta unidade.');
      }
      if (next === 'enviado') {
        const weight = integer(data,'weight_g'), length = decimal(data,'length_cm'), width = decimal(data,'width_cm'), height = decimal(data,'height_cm');
        const tracking = text(data,'tracking_code');
        if (!weight || weight <= 0 || !length || length <= 0 || !width || width <= 0 || !height || height <= 0) throw new Error('Informe peso e dimensões positivos.');
        if (!tracking || !/^[A-Za-z0-9-]{6,60}$/.test(tracking) || data.get('handover') !== 'on') throw new Error('Informe o rastreio e confirme a entrega à transportadora.');
        await sql`update ctl_integration_shipments set weight_g = ${weight}, length_cm = ${length}, width_cm = ${width}, height_cm = ${height}, tracking_code = ${tracking} where id = ${id!}`;
        await sql`update ctl_orders set tracking_code = ${tracking}, tracking_situation = 'Em trânsito' where id = ${shipment.order_id}`;
        await sql`update ctl_integration_stock set tracking_code = ${tracking}, status = 'Enviado' where id = ${shipment.inventory_id}`;
        note = { unitId: Number(shipment.unit_id), orderKey: String(order.order_key || ''), tracking };
      }
      if (next === 'cancelado') await sql`update ctl_integration_stock set status = 'Disponível', order_id = null where id = ${shipment.inventory_id}`;
      await sql`update ctl_integration_shipments set status = ${next}, updated_at = now() where id = ${id!}`;
      await sql`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${shipment.unit_id},${id!},${next},${actor.email})`;
      return note;
    });
    if (handed) {
      const tray = await pushTracking(handed.orderKey, handed.tracking);
      await db()`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${handed.unitId},${id!},${tray},${actor.email})`;
    }
  } catch (error) { finish(back, error instanceof Error && !('code' in error) ? error.message : 'Não foi possível atualizar o envio.'); }
  finish(back);
}

export async function issueLabel(data: FormData) {
  const actor = await requireOperator();
  const id = text(data, 'shipment_id');
  try {
    if (!uuid(id)) throw new Error('Envio não encontrado.');
    const weight = integer(data, 'weight_g');
    const length = decimal(data, 'length_cm');
    const width = decimal(data, 'width_cm');
    const height = decimal(data, 'height_cm');
    if (!weight || weight <= 0 || !length || length <= 0 || !width || width <= 0 || !height || height <= 0) {
      throw new Error('Informe peso e dimensões positivos.');
    }
    const sql = db();
    const [current] = await sql`select s.id, s.status, s.tracking_code, s.recipient, s.customs_description, s.declared_value, s.currency, s.hs_code, s.origin_country, s.unit_id, o.order_key, o.tracking_code as order_tracking
      from ctl_integration_shipments s join ctl_orders o on o.id = s.order_id where s.id = ${id!}`;
    if (!current || current.status !== 'embalado') throw new Error('A etiqueta só é emitida depois da embalagem.');
    if (current.tracking_code) throw new Error('Este volume já tem rastreio. Imprima a etiqueta ou confirme a entrega.');
    if (current.order_tracking) throw new Error('O pedido já tem outro rastreio no NSControle.');
    const issued = await announceParcel({
      shipmentId: current.id,
      orderKey: String(current.order_key),
      recipient: current.recipient,
      description: current.customs_description,
      value: Number(current.declared_value),
      currency: current.currency,
      hsCode: current.hs_code,
      originCountry: current.origin_country,
      weightG: weight,
      lengthCm: length,
      widthCm: width,
      heightCm: height,
    });
    if (!issued.ok) {
      await sql`update ctl_integration_shipments set label_error = ${issued.error}, weight_g = ${weight}, length_cm = ${length}, width_cm = ${width}, height_cm = ${height}, updated_at = now() where id = ${id!}`;
      await sql`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${current.unit_id},${id!},${`Erro de emissão: ${issued.error}`},${actor.email})`;
      throw new Error(issued.error);
    }
    await sql.begin(async tx => {
      const [locked] = await tx`select id, status, tracking_code from ctl_integration_shipments where id = ${id!} for update`;
      if (!locked || locked.status !== 'embalado' || locked.tracking_code) throw new Error('Este volume já tem rastreio. Atualize a página.');
      await tx`update ctl_integration_shipments set tracking_code = ${issued.tracking}, label_pdf = ${issued.pdf}, label_error = null, weight_g = ${weight}, length_cm = ${length}, width_cm = ${width}, height_cm = ${height}, updated_at = now() where id = ${id!}`;
      await tx`update ctl_orders set tracking_code = ${issued.tracking}, tracking_situation = 'Em trânsito' where id = (select order_id from ctl_integration_shipments where id = ${id!})`;
      await tx`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${current.unit_id},${id!},${`Etiqueta emitida ${issued.tracking}`},${actor.email})`;
    });
    const tray = await pushTracking(String(current.order_key), issued.tracking);
    await sql`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${current.unit_id},${id!},${tray},${actor.email})`;
  } catch (error) {
    finish('/integracao/transporte', error instanceof Error && !('code' in error) ? error.message : 'Não foi possível emitir a etiqueta.');
  }
  finish('/integracao/transporte');
}
