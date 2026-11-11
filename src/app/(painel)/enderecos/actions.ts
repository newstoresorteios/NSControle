"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow, updateRow } from "@/lib/db";
import { text } from "@/lib/form";
import { validUuid } from "@/lib/operational";

function addressFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    cpf: text(formData, "cpf"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    street: text(formData, "street"),
    street_number: text(formData, "street_number"),
    complement: text(formData, "complement"),
    district: text(formData, "district"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    zip_code: text(formData, "zip_code"),
    use_us: text(formData, "use_us"),
    use_eu: text(formData, "use_eu"),
    use_jp: text(formData, "use_jp"),
  };
}

export async function createAddress(formData: FormData) {
  await requireTeam();
  const fields = addressFields(formData);
  if (!fields.name) redirect("/enderecos?erro=1");
  try {
    await insertRow("ctl_redirect_addresses", fields);
  } catch {
    redirect("/enderecos?erro=1");
  }
  revalidatePath("/enderecos");
  redirect("/enderecos");
}

export async function updateAddress(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id") ?? "";
  if (!validUuid(id)) redirect("/enderecos?erro=1");
  const fields = addressFields(formData);
  if (!fields.name) redirect("/enderecos?erro=1");
  try {
    await updateRow("ctl_redirect_addresses", fields, "id", id);
  } catch {
    redirect("/enderecos?erro=1");
  }
  revalidatePath("/enderecos");
  redirect("/enderecos?ok=1");
}
