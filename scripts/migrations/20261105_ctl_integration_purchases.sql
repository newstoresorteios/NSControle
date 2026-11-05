-- Marks which Europa orders the NS team asked Ana to buy.
-- Purchase, payment and invoices stay on ctl_orders and ctl_supplier_invoices.

begin;

create table if not exists public.ctl_integration_purchase_requests (
  order_id uuid primary key references public.ctl_orders (id),
  requested_by text not null,
  requested_at timestamptz not null default now()
);

alter table public.ctl_supplier_invoices
  add column if not exists document bytea,
  add column if not exists document_type text;

alter table public.ctl_supplier_invoices
  drop constraint if exists ctl_supplier_invoices_document_type_chk;

alter table public.ctl_supplier_invoices
  add constraint ctl_supplier_invoices_document_type_chk
  check (document_type is null or document_type = 'application/pdf');

alter table public.ctl_integration_purchase_requests enable row level security;

commit;
