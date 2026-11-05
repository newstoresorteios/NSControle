-- Extra conference photos for a received unit. The first photo also stays
-- on ctl_integration_units so the existing cover image keeps working.

begin;

create table if not exists public.ctl_integration_unit_photos (
  id bigint generated always as identity primary key,
  unit_id bigint not null references public.ctl_integration_units (id),
  position smallint not null check (position >= 0 and position < 8),
  photo bytea not null,
  photo_type text not null check (photo_type in ('image/jpeg', 'image/png', 'image/webp')),
  unique (unit_id, position)
);

create index if not exists ctl_integration_unit_photos_unit
  on public.ctl_integration_unit_photos (unit_id, position);

alter table public.ctl_integration_unit_photos enable row level security;

insert into public.ctl_integration_unit_photos (unit_id, position, photo, photo_type)
select id, 0, photo, photo_type
from public.ctl_integration_units
on conflict (unit_id, position) do nothing;

commit;
