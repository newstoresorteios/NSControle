"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow } from "@/lib/db";
import { decimal, flag, text } from "@/lib/form";

export async function createTradeIn(formData: FormData) {
  await requireTeam();
  const clientName = text(formData, "client_name");
  if (!clientName) redirect("/compras?erro=1");
  const code = text(formData, "code");
  let orderId: string | null = null;
  if (code) {
    const found = await db()<{ id: string }[]>`
      select id from ctl_orders where order_key = ${code}
      order by finance_month_key desc nulls last
      limit 1
    `;
    orderId = found[0]?.id ?? null;
  }
  try {
    await insertRow("ctl_trade_ins", {
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
  } catch {
    redirect("/compras?erro=1");
  }
  revalidatePath("/compras");
  redirect("/compras");
}
