"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { decimal, flag, text } from "@/lib/form";

export async function createTradeIn(formData: FormData) {
  const { supabase } = await requireTeam();
  const clientName = text(formData, "client_name");
  if (!clientName) redirect("/compras?erro=1");
  const code = text(formData, "code");
  let orderId: string | null = null;
  if (code) {
    const { data } = await supabase
      .from("ctl_orders")
      .select("id")
      .eq("order_key", code)
      .order("finance_month_key", { ascending: false })
      .limit(1)
      .maybeSingle();
    orderId = data?.id ?? null;
  }
  const { error } = await supabase.from("ctl_trade_ins").insert({
    client_name: clientName,
    phone: text(formData, "phone"),
    cpf: text(formData, "cpf"),
    code,
    model: text(formData, "model"),
    condition: text(formData, "condition"),
    address: text(formData, "address"),
    cost: decimal(formData, "cost"),
    invoice_received: flag(formData, "invoice_received"),
    delivered: flag(formData, "delivered"),
    order_id: orderId,
  });
  if (error) redirect("/compras?erro=1");
  revalidatePath("/compras");
  redirect("/compras");
}
