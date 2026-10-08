-- Supplier invoices uploaded in Pagamentos. Amounts stay in the invoice
-- currency and do not overwrite ctl_orders.purchase_amount.

create table if not exists public.ctl_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_name text,
  bill_to text,
  invoice_number text,
  invoice_date date,
  currency text not null default 'EUR',
  total_amount numeric(14,2),
  payment_method text,
  bank_name text,
  iban text,
  swift text,
  beneficiary text,
  due_date date,
  due_amount numeric(14,2),
  template text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'confirmado')),
  draft_document boolean not null default false,
  source_filename text,
  raw_text text,
  warning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ctl_supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.ctl_supplier_invoices (id) on delete cascade,
  line_no integer not null,
  kind text not null check (kind in ('produto', 'taxa')),
  description text,
  reference text,
  order_key text,
  quantity numeric(14,2),
  unit_amount numeric(14,2),
  line_amount numeric(14,2),
  created_at timestamptz not null default now(),
  unique (invoice_id, line_no)
);

create table if not exists public.ctl_supplier_invoice_links (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.ctl_supplier_invoice_lines (id) on delete cascade,
  order_id uuid references public.ctl_orders (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (line_id, order_id)
);

create index if not exists ctl_supplier_invoices_number_idx
  on public.ctl_supplier_invoices (invoice_number);

create index if not exists ctl_supplier_invoice_lines_invoice_idx
  on public.ctl_supplier_invoice_lines (invoice_id);

create index if not exists ctl_supplier_invoice_links_order_idx
  on public.ctl_supplier_invoice_links (order_id);

create or replace function public.ctl_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ctl_supplier_invoices_touch on public.ctl_supplier_invoices;
create trigger ctl_supplier_invoices_touch
before update on public.ctl_supplier_invoices
for each row execute function public.ctl_touch_updated_at();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'service_role')
     and exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'ctl_private' and p.proname = 'is_team'
     ) then
    execute 'alter table public.ctl_supplier_invoices enable row level security';
    execute 'alter table public.ctl_supplier_invoice_lines enable row level security';
    execute 'alter table public.ctl_supplier_invoice_links enable row level security';
    execute 'revoke all on table public.ctl_supplier_invoices from public, anon';
    execute 'revoke all on table public.ctl_supplier_invoice_lines from public, anon';
    execute 'revoke all on table public.ctl_supplier_invoice_links from public, anon';
    execute 'grant select, insert, update, delete on table public.ctl_supplier_invoices to authenticated';
    execute 'grant select, insert, update, delete on table public.ctl_supplier_invoice_lines to authenticated';
    execute 'grant select, insert, update, delete on table public.ctl_supplier_invoice_links to authenticated';
    execute 'grant all on table public.ctl_supplier_invoices to service_role';
    execute 'grant all on table public.ctl_supplier_invoice_lines to service_role';
    execute 'grant all on table public.ctl_supplier_invoice_links to service_role';
    execute 'drop policy if exists ctl_supplier_invoices_team on public.ctl_supplier_invoices';
    execute 'create policy ctl_supplier_invoices_team on public.ctl_supplier_invoices for all to authenticated using (ctl_private.is_team()) with check (ctl_private.is_team())';
    execute 'drop policy if exists ctl_supplier_invoice_lines_team on public.ctl_supplier_invoice_lines';
    execute 'create policy ctl_supplier_invoice_lines_team on public.ctl_supplier_invoice_lines for all to authenticated using (ctl_private.is_team()) with check (ctl_private.is_team())';
    execute 'drop policy if exists ctl_supplier_invoice_links_team on public.ctl_supplier_invoice_links';
    execute 'create policy ctl_supplier_invoice_links_team on public.ctl_supplier_invoice_links for all to authenticated using (ctl_private.is_team()) with check (ctl_private.is_team())';
  end if;
end $$;
