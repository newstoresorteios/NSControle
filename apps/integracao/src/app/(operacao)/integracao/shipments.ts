import { db } from '@/lib/db';
import type { Recipient } from '@/lib/integracao';

export type ShipmentView = {
  id: string;
  unit_id: string | number;
  order_key: string | number;
  status: string;
  model: string | null;
  serial_number: string | null;
  delivered: boolean | null;
  commercial_status: string | null;
  order_tracking: string | null;
  tracking_code: string | null;
  item_weight: string | number | null;
  recipient: Partial<Recipient> | null;
  customs_description: string | null;
  declared_value: string | number | null;
  currency: string | null;
  hs_code: string | null;
  origin_country: string | null;
  weight_g: string | number | null;
  length_cm: string | number | null;
  width_cm: string | number | null;
  height_cm: string | number | null;
  label_error: string | null;
  label_ready: boolean | null;
};

export function loadShipments(statuses: string[]) {
    return db()<ShipmentView[]>`select s.id, s.unit_id, s.order_id, s.status, s.recipient, s.customs_description, s.declared_value, s.currency, s.hs_code, s.origin_country, s.weight_g, s.length_cm, s.width_cm, s.height_cm, s.tracking_code, s.label_error, (s.label_pdf is not null) as label_ready, s.created_at, u.serial_number, u.weight_g as item_weight, i.model, o.order_key, o.commercial_status, o.delivered, o.tracking_code as order_tracking
    from ctl_integration_shipments s
    join ctl_integration_units u on u.id = s.unit_id
    join ctl_integration_stock i on i.id = u.inventory_id
    join ctl_orders o on o.id = s.order_id
    where s.status = any(${statuses})
    order by case when s.status = 'enviado' then 1 else 0 end, s.created_at desc
    limit 100`;
}
