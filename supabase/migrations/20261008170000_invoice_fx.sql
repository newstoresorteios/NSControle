alter table public.ctl_supplier_invoices
  add column if not exists fx_rate numeric(18,6),
  add column if not exists fx_date date,
  add column if not exists fx_source text;

alter table public.ctl_orders
  add column if not exists purchase_currency text,
  add column if not exists purchase_foreign_amount numeric(14,2),
  add column if not exists purchase_fx_rate numeric(18,6),
  add column if not exists purchase_fx_date date;
