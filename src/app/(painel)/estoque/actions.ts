"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow, updateRow } from "@/lib/db";
import { decimal, text } from "@/lib/form";
import { calendarDate, nonnegativeMoney, panelPath, pathWith, validUuid } from "@/lib/operational";

export async function createInventoryItem(formData: FormData) {
  await requireTeam();
  const model = text(formData, "model");
  if (!model) redirect("/estoque?erro=1");
  const purchase = text(formData, "purchased_at");
  if (purchase && !calendarDate(purchase)) redirect("/estoque?erro=1");
  for (const field of ["sale_price", "cost"] as const) {
    if (!nonnegativeMoney(String(formData.get(field) ?? "")).ok) redirect("/estoque?erro=1");
  }
  try {
    await insertRow("ctl_inventory_items", {
      brand: text(formData, "brand"),
      model,
      origin: text(formData, "origin"),
      tracking_code: text(formData, "tracking_code"),
      sale_price: decimal(formData, "sale_price"),
      cost: decimal(formData, "cost"),
      location: text(formData, "location"),
      status: text(formData, "status") || "Disponível",
      notes: text(formData, "notes"),
      purchased_at: purchase,
    });
  } catch {
    redirect("/estoque?erro=1");
  }
  revalidatePath("/estoque");
  redirect("/estoque");
}

export async function updateInventoryItem(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id") ?? "";
  if (!validUuid(id)) redirect("/estoque?erro=1");
  const existing = await db()<{ id: string; model: string }[]>`
    select id, model from ctl_inventory_items where id = ${id} limit 1
  `;
  if (!existing[0]) redirect("/estoque?erro=1");
  const patch: Record<string, string | number | null> = {};
  for (const field of ["brand", "model", "origin", "tracking_code", "location", "status", "notes"] as const) {
    if (formData.has(field)) patch[field] = text(formData, field);
  }
  if (!(patch.model ?? existing[0].model)) redirect("/estoque?erro=1");
  if (formData.has("purchased_at")) {
    const purchase = text(formData, "purchased_at");
    if (purchase && !calendarDate(purchase)) redirect("/estoque?erro=1");
    patch.purchased_at = purchase;
  }
  for (const field of ["sale_price", "cost"] as const) {
    if (!formData.has(field)) continue;
    const amount = nonnegativeMoney(String(formData.get(field) ?? ""));
    if (!amount.ok) redirect("/estoque?erro=1");
    patch[field] = amount.value;
  }
  try {
    await updateRow("ctl_inventory_items", patch, "id", id);
  } catch {
    redirect("/estoque?erro=1");
  }
  revalidatePath("/estoque");
  redirect("/estoque?ok=1");
}

export async function deleteInventoryItem(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id") ?? "";
  const back = panelPath(text(formData, "return_to"), "/estoque", "/estoque");
  if (!validUuid(id)) redirect(pathWith(back, "erro", "excluir"));
  let outcome: "ok" | "excluir" | "integracao" = "ok";
  try {
    const linked = await db()<{ id: string }[]>`
      select id from ctl_integration_units where inventory_id = ${id} limit 1
    `;
    if (linked.length) outcome = "integracao";
    else {
      const removed = await db()<{ id: string }[]>`
        delete from ctl_inventory_items where id = ${id} returning id
      `;
      if (!removed.length) outcome = "excluir";
    }
  } catch {
    outcome = "excluir";
  }
  if (outcome !== "ok") redirect(pathWith(back, "erro", outcome));
  revalidatePath("/estoque");
  redirect(pathWith(back, "ok", "excluido"));
}
