-- Tab reads only need the open sheet, the tracking queue, or the archive.
-- The numeric sort matches the order used by the pedidos list.

create index if not exists ctl_orders_open_number_idx
  on public.ctl_orders (
    (case when order_key ~ '^[0-9]+$' then 0 else 1 end),
    (case when order_key ~ '^[0-9]+$' then order_key::numeric end) desc nulls last,
    (coalesce(label, order_key))
  )
  where delivered = false
    and (origin is not null or tray_modified_at is not null);

create index if not exists ctl_orders_archive_updated_idx
  on public.ctl_orders (updated_at desc)
  where delivered = true;

create index if not exists ctl_orders_tracking_open_idx
  on public.ctl_orders (tracking_code)
  where delivered = false
    and tracking_code is not null;
