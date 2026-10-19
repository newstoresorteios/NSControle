-- For local validation, first verify that the target PostgreSQL database is development.
-- Do not apply to production as part of local validation.
-- Additive only; historical values remain unknown.
alter table public.ctl_orders
  add column if not exists supplier_name text,
  add column if not exists supplier_purchase_date date,
  add column if not exists tax_identified_at timestamptz;

create index if not exists ctl_orders_tax_identified_idx
  on public.ctl_orders (tax_identified_at desc)
  where tax_identified_at is not null;

alter table public.ctl_cancellations
  add column if not exists source text,
  add column if not exists source_occurrence text;

create unique index if not exists ctl_cancellations_source_occurrence_uidx
  on public.ctl_cancellations (source, source_occurrence)
  where source is not null and source_occurrence is not null;
