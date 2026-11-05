import { db } from '@/lib/db';

export function loadShipments(statuses: string[]) {
  return db()`select s.*, u.serial_number, u.weight_g as item_weight, i.model, o.order_key, o.commercial_status, o.delivered, o.tracking_code as order_tracking
    from ctl_integration_shipments s
    join ctl_integration_units u on u.id = s.unit_id
    join ctl_integration_stock i on i.id = u.inventory_id
    join ctl_orders o on o.id = s.order_id
    where s.status = any(${statuses})
    order by case when s.status = 'enviado' then 1 else 0 end, s.created_at desc
    limit 100`;
}
