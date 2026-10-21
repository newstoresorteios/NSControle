-- Separate platform membership and physical stock from the internal NSControle.
begin;
alter table ctl_integration_members drop constraint if exists ctl_integration_members_email_fkey;
alter table ctl_integration_members drop constraint if exists ctl_integration_members_role_check;
alter table ctl_integration_members add constraint ctl_integration_members_role_check check(role in ('redirect','newstore'));

create table if not exists ctl_integration_stock (
  id uuid primary key default gen_random_uuid(),
  brand text,
  model text not null,
  origin text not null default 'Redirect Europa',
  location text,
  status text not null default 'Disponível',
  notes text,
  tracking_code text,
  order_id uuid references ctl_orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into ctl_integration_stock(id,brand,model,origin,location,status,notes,tracking_code,order_id,created_at,updated_at)
select i.id,i.brand,i.model,coalesce(i.origin,'Redirect Europa'),i.location,coalesce(i.status,'Disponível'),i.notes,i.tracking_code,i.order_id,i.created_at,i.updated_at
from ctl_inventory_items i join ctl_integration_units u on u.inventory_id=i.id
on conflict(id) do nothing;
alter table ctl_integration_units drop constraint if exists ctl_integration_units_inventory_id_fkey;
alter table ctl_integration_units add constraint ctl_integration_units_inventory_id_fkey foreign key(inventory_id) references ctl_integration_stock(id);
alter table ctl_integration_stock enable row level security;
drop trigger if exists ctl_integration_stock_touch on ctl_integration_stock;
create trigger ctl_integration_stock_touch before update on ctl_integration_stock
for each row execute function ctl_touch_updated_at();

-- Existing internal users may also operate the separate platform, explicitly.
-- Redirect members do not need and must not gain membership in NSControle.
insert into ctl_integration_members(email,role)
select email,'newstore' from ctl_allowed_emails
on conflict(email) do nothing;
commit;
