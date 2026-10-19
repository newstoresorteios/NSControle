"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow, updateRow } from "@/lib/db";
import { decimal, flag, text } from "@/lib/form";
import { nonnegativeMoney, validUuid } from "@/lib/operational";

export async function createTradeIn(formData: FormData) {
  await requireTeam();
  const clientName = text(formData, "client_name");
  if (!clientName) redirect("/compras?erro=1");
  if (!nonnegativeMoney(String(formData.get("cost") ?? "")).ok) redirect("/compras?erro=1");
  const code = text(formData, "code");
  let orderId: string | null = null;
  if (code) {
    const found = await db()<{ id: string }[]>`
      select id from ctl_orders where order_key = ${code}
      limit 2
    `;
    orderId = found.length === 1 ? found[0].id : null;
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

export async function updateTradeIn(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id") ?? "";
  if (!validUuid(id)) redirect("/compras?erro=1");
  const existing = await db()<{ id: string; client_name: string; code: string | null }[]>`
    select id, client_name, code from ctl_trade_ins where id = ${id} limit 1
  `;
  if (!existing[0]) redirect("/compras?erro=1");

  const patch: Record<string, string | number | boolean | null> = {};
  for (const field of ["client_name", "phone", "cpf", "code", "model", "condition", "address"] as const) {
    if (formData.has(field)) patch[field] = text(formData, field);
  }
  if (!(patch.client_name ?? existing[0].client_name)) redirect("/compras?erro=1");
  if (formData.has("code") && patch.code !== existing[0].code) {
    const code = patch.code;
    const matching = typeof code === "string" ? await db()<{ id: string }[]>`
      select id from ctl_orders where order_key = ${code} limit 2
    ` : [];
    if (matching.length > 1) redirect("/compras?erro=1");
    patch.order_id = matching[0]?.id ?? null;
  }
  if (formData.has("cost")) {
    const amount = nonnegativeMoney(String(formData.get("cost") ?? ""));
    if (!amount.ok) redirect("/compras?erro=1");
    patch.cost = amount.value;
  }
  for (const field of ["invoice_received", "delivered"] as const) {
    if (!formData.has(field)) continue;
    const value = String(formData.get(field));
    if (value !== "true" && value !== "false") redirect("/compras?erro=1");
    patch[field] = value === "true";
  }
  try {
    await updateRow("ctl_trade_ins", patch, "id", id);
  } catch {
    redirect("/compras?erro=1");
  }
  revalidatePath("/compras");
  redirect("/compras?ok=1");
}
