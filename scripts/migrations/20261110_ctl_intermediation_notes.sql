-- Notas de intermediação por mês. Os valores também preenchem a ficha do pedido
-- quando compra, taxa ou frete ainda estão vazios.

begin;

create table if not exists public.ctl_intermediation_notes (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  line_no integer not null,
  order_key text not null,
  label text,
  platform text,
  purchased boolean not null default false,
  tracking_code text,
  purchase_amount numeric(14,2),
  payment_fee numeric(14,2),
  shipping_cost numeric(14,2),
  gain_amount numeric(14,2),
  settled boolean,
  purchase_done boolean not null default false,
  order_id uuid references public.ctl_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, line_no)
);

create index if not exists ctl_intermediation_notes_month_idx on public.ctl_intermediation_notes (month);
create index if not exists ctl_intermediation_notes_order_idx on public.ctl_intermediation_notes (order_id);

drop trigger if exists ctl_intermediation_notes_touch on public.ctl_intermediation_notes;
create trigger ctl_intermediation_notes_touch
before update on public.ctl_intermediation_notes
for each row execute function public.ctl_touch_updated_at();

commit;
