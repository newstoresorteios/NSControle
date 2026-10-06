"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { decimal, monthDate } from "@/lib/form";

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
