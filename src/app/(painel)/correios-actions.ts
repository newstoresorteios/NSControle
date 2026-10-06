"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { runCorreiosSync } from "@/lib/correios-sync";

export async function syncCorreiosNow() {
  await requireTeam();
  const report = await runCorreiosSync({ force: true });
  revalidatePath("/");
  revalidatePath("/pedidos");
  redirect(`/?correios=${encodeURIComponent(report.reason)}&rastreios=${report.updated}`);
}
