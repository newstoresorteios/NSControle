-- Neon: additive module schema. Existing inventory remains the source of physical units.
begin;
create table if not exists ctl_integration_members (
  email text primary key references ctl_allowed_emails(email),
  role text not null check (role in ('redirect'))
);
create table if not exists ctl_integration_order_data (
  order_id uuid primary key references ctl_orders(id),
  recipient jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists ctl_integration_units (
  id bigint generated always as identity (start with 1030) primary key,
  inventory_id uuid not null unique references ctl_inventory_items(id),
  serial_number text not null unique,
  weight_g integer not null check (weight_g > 0),
  photo bytea not null,
  photo_type text not null check (photo_type in ('image/jpeg','image/png','image/webp')),
  created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists ctl_integration_shipments (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references ctl_integration_units(id),
  order_id uuid not null references ctl_orders(id),
  status text not null default 'pendente' check (status in ('pendente','preparando','embalado','enviado','cancelado')),
  recipient jsonb not null,
  customs_description text not null,
  declared_value numeric(14,2) not null check (declared_value > 0),
  currency text not null check (currency in ('EUR','USD','BRL')),
  hs_code text not null,
  origin_country text not null,
  weight_g integer check (weight_g > 0),
  length_cm numeric check (length_cm > 0),
  width_cm numeric check (width_cm > 0),
  height_cm numeric check (height_cm > 0),
  tracking_code text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ctl_integration_unit_active on ctl_integration_shipments(unit_id) where status <> 'cancelado';
-- Initial release supports one parcel per order; avoids silently overwriting order tracking.
create unique index if not exists ctl_integration_order_active on ctl_integration_shipments(order_id) where status <> 'cancelado';
create table if not exists ctl_integration_events (
  id bigint generated always as identity primary key,
  unit_id bigint not null references ctl_integration_units(id),
  shipment_id uuid references ctl_integration_shipments(id),
  action text not null,
  actor text not null,
  created_at timestamptz not null default now()
);
create index if not exists ctl_integration_events_unit on ctl_integration_events(unit_id, id desc);
-- Server-only tables, also protected if this schema is ever exposed by a Data API.
alter table ctl_integration_members enable row level security;
alter table ctl_integration_order_data enable row level security;
alter table ctl_integration_units enable row level security;
alter table ctl_integration_shipments enable row level security;
alter table ctl_integration_events enable row level security;
commit;
