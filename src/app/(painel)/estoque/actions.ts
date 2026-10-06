"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { decimal, text } from "@/lib/form";

export async function createInventoryItem(formData: FormData) {
  const { supabase } = await requireTeam();
  const model = text(formData, "model");
  if (!model) redirect("/estoque?erro=1");
  const { error } = await supabase.from("ctl_inventory_items").insert({
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
  if (error) redirect("/estoque?erro=1");
  revalidatePath("/estoque");
  redirect("/estoque");
}
