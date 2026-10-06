"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { insertRow } from "@/lib/db";
import { decimal, text } from "@/lib/form";

export async function createInventoryItem(formData: FormData) {
  await requireTeam();
  const model = text(formData, "model");
  if (!model) redirect("/estoque?erro=1");
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
      purchased_at: text(formData, "purchased_at"),
    });
  } catch {
    redirect("/estoque?erro=1");
  }
  revalidatePath("/estoque");
  redirect("/estoque");
}
