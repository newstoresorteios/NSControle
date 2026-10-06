-- A Tray insert for an order that already exists in the spreadsheet updates that
-- row instead of opening a second ficha in Loja nova.

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
