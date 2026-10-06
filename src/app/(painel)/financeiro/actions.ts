"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { decimal, monthDate } from "@/lib/form";

export async function saveGoal(formData: FormData) {
  const { supabase } = await requireTeam();
  const month = monthDate(formData, "month");
  const target = decimal(formData, "target_amount");
  if (!month || target == null) redirect("/financeiro");
  const { error } = await supabase
    .from("ctl_monthly_goals")
    .upsert({ month, target_amount: target }, { onConflict: "month" });
  if (error) redirect(`/financeiro?month=${month.slice(0, 7)}&erro=1`);
  revalidatePath("/financeiro");
  redirect(`/financeiro?month=${month.slice(0, 7)}`);
}
