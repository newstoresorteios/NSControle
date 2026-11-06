-- Named team accounts. Password hashes stay in the app database so an admin
-- can create, change and remove users without the Supabase admin key.

begin;

alter table public.ctl_team_members
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists role text not null default 'membro',
  add column if not exists password_hash text;

alter table public.ctl_team_members
  drop constraint if exists ctl_team_members_role_chk;

alter table public.ctl_team_members
  add constraint ctl_team_members_role_chk check (role in ('admin', 'membro'));

create unique index if not exists ctl_team_members_username
  on public.ctl_team_members (username);

update public.ctl_team_members
set role = 'admin'
where password_hash is null
  and role = 'membro';

commit;
