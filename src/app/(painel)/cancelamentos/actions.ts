"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, updateRow } from "@/lib/db";
import { text } from "@/lib/form";
import { calendarDate, nonnegativeMoney, validUuid } from "@/lib/operational";

function cancellationFields(formData: FormData) {
  const amount = nonnegativeMoney(String(formData.get("amount") ?? ""));
  const due = text(formData, "due_date");
  const done = text(formData, "done_date");
  if (!amount.ok || (due && !calendarDate(due)) || (done && !calendarDate(done))) return null;
  return {
    model: text(formData, "model"),
    refund_method: text(formData, "refund_method"),
    bank_details: text(formData, "bank_details"),
    amount: amount.value,
    due_date: due,
    done_date: done,
    reason: text(formData, "reason"),
    status: text(formData, "status") || "Cancelado",
    gateway: text(formData, "gateway"),
  };
}

export async function createCancellation(formData: FormData) {
  await requireTeam();
  const orderKey = text(formData, "order_key");
  const fields = cancellationFields(formData);
  if (!fields) redirect("/cancelamentos?erro=1");
  try {
    await db().begin(async (tx) => {
      const found = orderKey ? await tx<{ id: string }[]>`
        select id from ctl_orders where order_key = ${orderKey} limit 2
      ` : [];
      if (found.length > 1) throw new Error("ambiguous_order");
      const orderId = found[0]?.id ?? null;
      if (orderId) await tx`update ctl_orders set commercial_status = 'CANCELADO' where id = ${orderId}`;
      const row = { order_id: orderId, order_key: orderKey, ...fields };
      await tx`insert into ctl_cancellations ${tx(row)}`;
    });
  } catch {
    redirect("/cancelamentos?erro=1");
  }
  revalidatePath("/cancelamentos");
  redirect("/cancelamentos");
}

export async function updateCancellation(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id") ?? "";
  if (!validUuid(id)) redirect("/cancelamentos?erro=1");
  const exists = await db()<{ id: string }[]>`select id from ctl_cancellations where id = ${id} limit 1`;
  if (!exists[0]) redirect("/cancelamentos?erro=1");
  const fields = cancellationFields(formData);
  if (!fields) redirect("/cancelamentos?erro=1");
  try {
    await updateRow("ctl_cancellations", fields, "id", id);
  } catch {
    redirect("/cancelamentos?erro=1");
  }
  revalidatePath("/cancelamentos");
  revalidatePath("/financeiro");
  redirect("/cancelamentos?ok=1");
}
