-- Last Correios API consultation timestamp for open trackings.
-- Additive only; safe to re-run.
alter table public.ctl_orders
  add column if not exists tracking_checked_at timestamptz;

create index if not exists ctl_orders_tracking_checked_idx
  on public.ctl_orders (tracking_checked_at)
  where tracking_code is not null and delivered = false;
