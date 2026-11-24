"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { decimal, monthDate, text } from "@/lib/form";

const uuid = (value: string | null) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

function finish(month: string | null, error?: string, ok = "1"): never {
  revalidatePath("/intermediacao");
  const target = month ? `/intermediacao?month=${month.slice(0, 7)}` : "/intermediacao";
  const sep = target.includes("?") ? "&" : "?";
  redirect(`${target}${error ? `${sep}erro=${encodeURIComponent(error)}` : `${sep}ok=${encodeURIComponent(ok)}`}`);
}

function orderKey(value: string | null) {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const folded = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const labeled = folded.match(/^pedido\s+(\d+)\b/);
  const bare = folded.match(/^(\d+)\b/);
  const key = labeled?.[1] || bare?.[1];
  if (!key) return null;
  return { key, label: raw };
}

function money(data: FormData, name: string) {
  const amount = decimal(data, name);
  if (amount != null && (amount < 0 || amount > 9_999_999_999.99)) return false as const;
  return amount;
}

async function orderId(sql: ReturnType<typeof db>, key: string) {
  const [order] = await sql<{ id: string }[]>`
    select id from ctl_orders
    where order_key = ${key}
    order by finance_month_key desc nulls last
    limit 1
  `;
  return order?.id ?? null;
}

async function fillEmptyOrder(
  sql: ReturnType<typeof db>,
  id: string | null,
  values: { platform: string | null; purchased: boolean; tracking: string | null; purchase: number | null; tax: number | null; freight: number | null },
) {
  if (!id) return;
  await sql`
    update ctl_orders set
      purchase_amount = coalesce(purchase_amount, ${values.purchase}),
      import_tax = coalesce(import_tax, ${values.tax}),
      shipping_cost = coalesce(shipping_cost, ${values.freight}),
      origin = coalesce(nullif(btrim(origin), ''), ${values.platform}),
      tracking_code = coalesce(nullif(btrim(tracking_code), ''), ${values.tracking}),
      purchased = purchased or ${values.purchased}
    where id = ${id}
  `;
}

export async function saveNote(data: FormData) {
  await requireTeam();
  const month = monthDate(data, "month");
  const parsed = orderKey(text(data, "order_key"));
  const purchase = money(data, "purchase_amount");
  const tax = money(data, "payment_fee");
  const freight = money(data, "shipping_cost");
  try {
    if (!month || !parsed || purchase === false || tax === false || freight === false) {
      throw new Error("Informe o mês, o número do pedido e valores válidos.");
    }
    const platform = text(data, "platform");
    const tracking = text(data, "tracking_code");
    const purchased = data.get("purchased") === "on";
    const id = text(data, "id");
    const sql = db();
    const linked = await orderId(sql, parsed.key);
    if (uuid(id)) {
      const [current] = await sql<{ id: string }[]>`select id from ctl_intermediation_notes where id = ${id!}`;
      if (!current) throw new Error("Nota não encontrada.");
      await sql`
        update ctl_intermediation_notes set
          month = ${month},
          order_key = ${parsed.key},
          label = ${parsed.label},
          platform = ${platform},
          purchased = ${purchased},
          tracking_code = ${tracking},
          purchase_amount = ${purchase},
          payment_fee = ${tax},
          shipping_cost = ${freight},
          purchase_done = ${purchase == null && tax == null && freight == null && purchased},
          order_id = ${linked}
        where id = ${id!}
      `;
    } else {
      const [next] = await sql<{ line_no: number }[]>`
        select coalesce(max(line_no), 0) + 1 as line_no from ctl_intermediation_notes where month = ${month}
      `;
      await sql`
        insert into ctl_intermediation_notes (
          month, line_no, order_key, label, platform, purchased, tracking_code,
          purchase_amount, payment_fee, shipping_cost, purchase_done, order_id
        ) values (
          ${month}, ${next.line_no}, ${parsed.key}, ${parsed.label}, ${platform}, ${purchased}, ${tracking},
          ${purchase}, ${tax}, ${freight}, ${purchase == null && tax == null && freight == null && purchased}, ${linked}
        )
      `;
    }
    await fillEmptyOrder(sql, linked, { platform, purchased, tracking, purchase, tax, freight });
  } catch (error) {
    finish(month, error instanceof Error && !("code" in error) ? error.message : "Não foi possível salvar a nota.");
  }
  finish(month);
}

export async function deleteNote(data: FormData) {
  await requireTeam();
  const month = monthDate(data, "month");
  const id = text(data, "id");
  try {
    if (!uuid(id)) throw new Error("Nota inválida.");
    const [removed] = await db()`delete from ctl_intermediation_notes where id = ${id!} returning id`;
    if (!removed) throw new Error("Nota não encontrada.");
  } catch (error) {
    finish(month, error instanceof Error && !("code" in error) ? error.message : "Não foi possível excluir a nota.");
  }
  finish(month, undefined, "excluida");
}
