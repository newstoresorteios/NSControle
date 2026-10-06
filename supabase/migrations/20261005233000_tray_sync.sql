-- Tray store orders land in the same ctl_orders rows the painel already reads.
-- Spreadsheet costs, import tax and physical stock stay untouched.

alter table public.ctl_orders
  add column if not exists data_source text not null default 'planilha',
  add column if not exists tray_modified_at timestamptz,
  add column if not exists notes_tray text;

do $$
begin
  alter table public.ctl_orders
    add constraint ctl_orders_data_source_chk
    check (data_source in ('planilha', 'manual', 'tray'));
exception
  when duplicate_object then null;
end $$;

create index if not exists ctl_orders_tray_modified_idx
  on public.ctl_orders (tray_modified_at)
  where tray_modified_at is not null;

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
for each row execute function ctl_private.touch_updated_at();

insert into public.ctl_tray_sync (id)
values ('orders')
on conflict (id) do nothing;

alter table public.ctl_tray_sync enable row level security;
revoke all on table public.ctl_tray_sync from public, anon;
grant select, insert, update, delete on table public.ctl_tray_sync to authenticated;
grant all on table public.ctl_tray_sync to service_role;

drop policy if exists ctl_tray_sync_team on public.ctl_tray_sync;
create policy ctl_tray_sync_team on public.ctl_tray_sync
for all to authenticated
using (ctl_private.is_team())
with check (ctl_private.is_team());
