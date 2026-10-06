-- NS Controle lives on the store project because the org is at the free
-- project limit. Tables are separate from the agent database and from
-- customer data: only rows in ctl_team_members can read or write them.

create schema if not exists ctl_private;

create or replace function ctl_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.ctl_allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table public.ctl_team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function ctl_private.is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ctl_team_members
    where user_id = auth.uid()
  );
$$;

revoke all on function ctl_private.is_team() from public, anon;
grant execute on function ctl_private.is_team() to authenticated;

create or replace function ctl_private.sync_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.ctl_allowed_emails
    where email = lower(coalesce(new.email, ''))
  ) then
    insert into public.ctl_team_members (user_id, email)
    values (new.id, lower(new.email))
    on conflict (user_id) do update set email = excluded.email;
  else
    delete from public.ctl_team_members where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ctl_sync_team_member on auth.users;
create trigger ctl_sync_team_member
after insert or update of email on auth.users
for each row execute function ctl_private.sync_team_member();

create table public.ctl_orders (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctl_orders_month_key_chk check (
    finance_month_key = coalesce(finance_month, date '0001-01-01')
  ),
  constraint ctl_orders_identity unique (order_key, flow, finance_month_key)
);

create index ctl_orders_month_idx on public.ctl_orders (finance_month);
create index ctl_orders_commercial_idx on public.ctl_orders (commercial_status);
create index ctl_orders_situation_idx on public.ctl_orders (tracking_situation);

create trigger ctl_orders_touch
before update on public.ctl_orders
for each row execute function ctl_private.touch_updated_at();

create table public.ctl_monthly_goals (
  month date primary key,
  target_amount numeric(14,2) not null,
  updated_at timestamptz not null default now()
);

create trigger ctl_monthly_goals_touch
before update on public.ctl_monthly_goals
for each row execute function ctl_private.touch_updated_at();

create table public.ctl_inventory_items (
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

create trigger ctl_inventory_touch
before update on public.ctl_inventory_items
for each row execute function ctl_private.touch_updated_at();

create table public.ctl_trade_ins (
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

create table public.ctl_cancellations (
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

insert into public.ctl_allowed_emails (email)
values ('newstoresorteios@gmail.com')
on conflict (email) do nothing;

grant usage on schema ctl_private to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'ctl_allowed_emails',
    'ctl_team_members',
    'ctl_orders',
    'ctl_monthly_goals',
    'ctl_inventory_items',
    'ctl_trade_ins',
    'ctl_cancellations'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on table public.%I from public, anon', tbl);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      tbl
    );
    execute format('grant all on table public.%I to service_role', tbl);
  end loop;
end $$;

create policy ctl_allowed_emails_team on public.ctl_allowed_emails
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());

create policy ctl_team_members_self on public.ctl_team_members
for select to authenticated
using (user_id = auth.uid() or ctl_private.is_team());

create policy ctl_team_members_write on public.ctl_team_members
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());

create policy ctl_orders_team on public.ctl_orders
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());

create policy ctl_monthly_goals_team on public.ctl_monthly_goals
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());

create policy ctl_inventory_team on public.ctl_inventory_items
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());

create policy ctl_trade_ins_team on public.ctl_trade_ins
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());

create policy ctl_cancellations_team on public.ctl_cancellations
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());
