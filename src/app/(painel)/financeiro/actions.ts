"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { decimal, monthDate } from "@/lib/form";
import { nonnegativeMoney, validUuid } from "@/lib/operational";

export async function markOrderTaxed(formData: FormData) {
  await requireTeam();
  const lookup = String(formData.get("lookup") ?? "").trim();
  if (!lookup) redirect("/financeiro?aba=taxas&erro=pedido");
  let rows: { id: string }[];
  try {
    rows = await db()<{ id: string }[]>`
      select id from ctl_orders
      where order_key = ${lookup} or tracking_code = ${lookup}
      limit 2
    `;
  } catch {
    redirect("/financeiro?aba=taxas&erro=pedido");
  }
  if (rows.length !== 1) redirect("/financeiro?aba=taxas&erro=pedido");
  try {
    await db()`update ctl_orders set tax_identified_at = coalesce(tax_identified_at, now()) where id = ${rows[0].id}`;
  } catch {
    redirect("/financeiro?aba=taxas&erro=pedido");
  }
  revalidatePath("/financeiro");
  redirect("/financeiro?aba=taxas&ok=1");
}

export async function saveOrderImportTax(formData: FormData) {
  await requireTeam();
  const id = String(formData.get("id") ?? "");
  const amount = nonnegativeMoney(String(formData.get("import_tax") ?? ""));
  if (!validUuid(id) || !amount.ok) redirect("/financeiro?aba=taxas&erro=valor");
  let result;
  try {
    result = await db()`
      update ctl_orders set import_tax = ${amount.value}
      where id = ${id} and tax_identified_at is not null
    `;
  } catch {
    redirect("/financeiro?aba=taxas&erro=valor");
  }
  if (result.count !== 1) redirect("/financeiro?aba=taxas&erro=pedido");
  revalidatePath("/financeiro");
  redirect("/financeiro?aba=taxas&ok=1");
}

export async function setOrderTaxPaid(formData: FormData) {
  await requireTeam();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("tax_paid") ?? "");
  if (!validUuid(id) || !["true", "false"].includes(raw)) redirect("/financeiro?aba=taxas&erro=pedido");
  let result;
  try {
    result = await db()`
      update ctl_orders set tax_paid = ${raw === "true"}
      where id = ${id} and tax_identified_at is not null
    `;
  } catch {
    redirect("/financeiro?aba=taxas&erro=pedido");
  }
  if (result.count !== 1) redirect("/financeiro?aba=taxas&erro=pedido");
  revalidatePath("/financeiro");
  redirect("/financeiro?aba=taxas&ok=1");
}

export async function saveGoal(formData: FormData) {
  await requireTeam();
  const month = monthDate(formData, "month");
  const target = decimal(formData, "target_amount");
  if (!month || target == null) redirect("/financeiro");
  try {
    await db()`
      insert into ctl_monthly_goals (month, target_amount)
      values (${month}, ${target})
      on conflict (month) do update set target_amount = excluded.target_amount
    `;
  } catch {
    redirect(`/financeiro?month=${month.slice(0, 7)}&erro=1`);
  }
  revalidatePath("/financeiro");
  redirect(`/financeiro?month=${month.slice(0, 7)}`);
}
