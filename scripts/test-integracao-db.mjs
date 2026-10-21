import assert from 'node:assert/strict';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const sql = postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL, {ssl:'require',max:1,prepare:false});
const rollback = new Error('test rollback');
try {
  await sql.begin(async tx => {
    const [order] = await tx`insert into ctl_orders(order_key,flow,finance_month_key,commercial_status,data_source)
      values (${`test-${randomUUID()}`},'encomenda','0001-01-01','A ENVIAR','manual') returning id`;
    const [inventory] = await tx`insert into ctl_inventory_items(model,origin,status) values ('Teste rollback','Redirect Europa','Disponível') returning id`;
    const [unit] = await tx`insert into ctl_integration_units(inventory_id,serial_number,weight_g,photo,photo_type,created_by)
      values (${inventory.id},${randomUUID()},700,${Buffer.from([255,216,255])},'image/jpeg','test') returning id`;
    const payload = {unit_id:unit.id,order_id:order.id,recipient:{name:'Teste'},customs_description:'Watch',declared_value:100,currency:'EUR',hs_code:'910211',origin_country:'CH',created_by:'test'};
    const [shipment] = await tx`insert into ctl_integration_shipments ${tx(payload)} returning id`;
    await tx`update ctl_inventory_items set status='Reservado',order_id=${order.id} where id=${inventory.id}`;
    await assert.rejects(tx.savepoint(async sp=>{await sp`insert into ctl_integration_shipments ${sp(payload)}`;}),e=>e.code==='23505');
    await tx`update ctl_integration_shipments set status='cancelado' where id=${shipment.id}`;
    await tx`update ctl_inventory_items set status='Disponível',order_id=null where id=${inventory.id}`;
    const [second] = await tx`insert into ctl_integration_shipments ${tx(payload)} returning id`;
    assert.notEqual(second.id,shipment.id);
    const [check] = await tx`select status,order_id from ctl_inventory_items where id=${inventory.id}`;
    assert.equal(check.status,'Disponível'); assert.equal(check.order_id,null);
    const tables = await tx`select relname from pg_class where relname like 'ctl_integration_%' and relkind='r' and not relrowsecurity`;
    assert.equal(tables.length,0);
    throw rollback;
  });
} catch (error) { if (error !== rollback) throw error; }
finally { await sql.end(); }
console.log('OK: reserva duplicada bloqueada, cancelamento permite nova reserva, vínculo com estoque e RLS. Dados de teste revertidos.');
