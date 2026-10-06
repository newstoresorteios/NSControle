"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { runTraySync } from "@/lib/tray-sync";

export async function syncTrayNow() {
  await requireTeam();
  const report = await runTraySync({ force: true });
  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  revalidatePath("/cancelamentos");
  redirect(`/?sync=${encodeURIComponent(report.reason)}&pedidos=${report.upserted}`);
}
