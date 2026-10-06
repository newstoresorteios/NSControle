"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow } from "@/lib/db";
import { decimal, text } from "@/lib/form";

export async function createCancellation(formData: FormData) {
  await requireTeam();
  const orderKey = text(formData, "order_key");
  let orderId: string | null = null;
  if (orderKey) {
    const found = await db()<{ id: string }[]>`
      select id from ctl_orders where order_key = ${orderKey}
      order by finance_month_key desc nulls last
      limit 1
    `;
    orderId = found[0]?.id ?? null;
    if (orderId) {
      await db()`update ctl_orders set commercial_status = 'CANCELADO' where id = ${orderId}`;
    }
  }
  try {
    await insertRow("ctl_cancellations", {
      order_id: orderId,
      order_key: orderKey,
      model: text(formData, "model"),
      refund_method: text(formData, "refund_method"),
      bank_details: text(formData, "bank_details"),
      amount: decimal(formData, "amount"),
      due_date: text(formData, "due_date"),
      done_date: text(formData, "done_date"),
      reason: text(formData, "reason"),
      status: text(formData, "status") || "Cancelado",
      gateway: text(formData, "gateway"),
    });
  } catch {
    redirect("/cancelamentos?erro=1");
  }
  revalidatePath("/cancelamentos");
  redirect("/cancelamentos");
}
