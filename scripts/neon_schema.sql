-- Controle tables on Neon. Login stays on Supabase Auth; this database
-- is reached only from the server with DATABASE_URL.

create or replace function public.ctl_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ctl_allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.ctl_team_members (
  user_id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ctl_orders (
  id uuid primary key default gen_random_uuid(),
  order_key text not null,
  label text,
  flow text not null check (flow in ('encomenda', 'loja_nova', 'ns_creditos')),
  origin text,
  reference text,
  product_name text,
  commercial_status text,
  sourcing_status text,
  purchased boolean not null default false,
  cpf_linked boolean not null default false,
  tax_paid boolean not null default false,
  delivered boolean not null default false,
  tracking_code text,
  tracking_situation text,
  tracking_alert text,
  tracking_correios text,
  tracking_event_at timestamptz,
  purchase_date date,
  payment_date date,
  sale_amount numeric(14,2),
  purchase_amount numeric(14,2),
  payment_fee numeric(14,2),
  shipping_cost numeric(14,2),
  import_tax numeric(14,2),
  gain_amount numeric(14,2) generated always as (
    case
      when sale_amount is null then null
      else sale_amount
        - coalesce(purchase_amount, 0)
        - coalesce(payment_fee, 0)
        - coalesce(shipping_cost, 0)
        - coalesce(import_tax, 0)
    end
  ) stored,
  supplier_days integer,
  supplier_ref text,
  notes_internal text,
  notes_robot text,
  notes_human text,
  finance_month date,
  finance_month_key date not null,
  data_source text not null default 'planilha' check (data_source in ('planilha', 'manual', 'tray', 'bi')),
  tray_modified_at timestamptz,
  notes_tray text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctl_orders_month_key_chk check (
    finance_month_key = coalesce(finance_month, date '0001-01-01')
  ),
  constraint ctl_orders_identity unique (order_key, flow, finance_month_key)
);

create index if not exists ctl_orders_month_idx on public.ctl_orders (finance_month);
create index if not exists ctl_orders_commercial_idx on public.ctl_orders (commercial_status);
create index if not exists ctl_orders_situation_idx on public.ctl_orders (tracking_situation);
create index if not exists ctl_orders_tray_modified_idx on public.ctl_orders (tray_modified_at) where tray_modified_at is not null;

drop trigger if exists ctl_orders_touch on public.ctl_orders;
create trigger ctl_orders_touch
before update on public.ctl_orders
for each row execute function public.ctl_touch_updated_at();

create table if not exists public.ctl_monthly_goals (
  month date primary key,
  target_amount numeric(14,2) not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists ctl_monthly_goals_touch on public.ctl_monthly_goals;
create trigger ctl_monthly_goals_touch
before update on public.ctl_monthly_goals
for each row execute function public.ctl_touch_updated_at();

create table if not exists public.ctl_inventory_items (
  id uuid primary key default gen_random_uuid(),
  purchased_at date,
  brand text,
  model text not null,
  origin text,
  tracking_code text,
  sale_price numeric(14,2),
  sale_price_note text,
  cost numeric(14,2),
  cost_note text,
  location text,
  notes text,
  status text,
  order_id uuid references public.ctl_orders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ctl_inventory_touch on public.ctl_inventory_items;
create trigger ctl_inventory_touch
before update on public.ctl_inventory_items
for each row execute function public.ctl_touch_updated_at();

create table if not exists public.ctl_trade_ins (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  phone text,
  cpf text,
  code text,
  model text,
  condition text,
  address text,
  cost numeric(14,2),
  invoice_received boolean not null default false,
  delivered boolean not null default false,
  order_id uuid references public.ctl_orders (id) on delete set null,
  inventory_item_id uuid references public.ctl_inventory_items (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ctl_cancellations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.ctl_orders (id) on delete set null,
  order_key text,
  model text,
  refund_method text,
  bank_details text,
  amount numeric(14,2),
  due_date date,
  done_date date,
  reason text,
  window_note text,
  status text,
  gateway text,
  created_at timestamptz not null default now()
);

create table if not exists public.ctl_tray_sync (
  id text primary key,
  cursor_page integer not null default 1,
  watermark date,
  backfill_done boolean not null default false,
  last_event_id bigint not null default 0,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  last_report jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists ctl_tray_sync_touch on public.ctl_tray_sync;
create trigger ctl_tray_sync_touch
before update on public.ctl_tray_sync
for each row execute function public.ctl_touch_updated_at();

insert into public.ctl_tray_sync (id) values ('orders') on conflict (id) do nothing;
insert into public.ctl_allowed_emails (email) values ('newstoresorteios@gmail.com') on conflict (email) do nothing;

create or replace function public.ctl_orders_reuse_sheet_row()
returns trigger
language plpgsql
as $$
declare
  existing_id uuid;
begin
  if new.data_source is distinct from 'tray' or new.flow is distinct from 'loja_nova' then
    return new;
  end if;

  select id into existing_id
  from public.ctl_orders
  where order_key = new.order_key
    and flow <> 'loja_nova'
  order by finance_month desc nulls last
  limit 1;

  if existing_id is null then
    return new;
  end if;

  update public.ctl_orders set
    tray_modified_at = coalesce(new.tray_modified_at, tray_modified_at),
    notes_tray = coalesce(new.notes_tray, notes_tray),
    product_name = coalesce(product_name, new.product_name),
    tracking_code = coalesce(tracking_code, new.tracking_code),
    sale_amount = coalesce(sale_amount, new.sale_amount),
    payment_date = coalesce(payment_date, new.payment_date),
    purchase_date = coalesce(purchase_date, new.purchase_date),
    finance_month = coalesce(finance_month, new.finance_month),
    finance_month_key = case
      when finance_month is null and new.finance_month is not null then new.finance_month
      else finance_month_key
    end
  where id = existing_id;

  return null;
end;
$$;

drop trigger if exists ctl_orders_reuse_sheet_row on public.ctl_orders;
create trigger ctl_orders_reuse_sheet_row
before insert on public.ctl_orders
for each row execute function public.ctl_orders_reuse_sheet_row();

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

drop trigger if exists ctl_supplier_invoices_touch on public.ctl_supplier_invoices;
create trigger ctl_supplier_invoices_touch
before update on public.ctl_supplier_invoices
for each row execute function public.ctl_touch_updated_at();
