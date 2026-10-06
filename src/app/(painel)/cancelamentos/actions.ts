"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { decimal, text } from "@/lib/form";

export async function createCancellation(formData: FormData) {
  const { supabase } = await requireTeam();
  const orderKey = text(formData, "order_key");
  let orderId: string | null = null;
  if (orderKey) {
    const { data } = await supabase
      .from("ctl_orders")
      .select("id")
      .eq("order_key", orderKey)
      .order("finance_month_key", { ascending: false })
      .limit(1)
      .maybeSingle();
    orderId = data?.id ?? null;
    if (orderId) {
      await supabase.from("ctl_orders").update({ commercial_status: "CANCELADO" }).eq("id", orderId);
    }
  }
  const { error } = await supabase.from("ctl_cancellations").insert({
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
  if (error) redirect("/cancelamentos?erro=1");
  revalidatePath("/cancelamentos");
  redirect("/cancelamentos");
}
