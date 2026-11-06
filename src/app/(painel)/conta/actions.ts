"use server";

import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { acceptablePassword, hashPassword, verifyPassword } from "@/lib/passwords";
import { createClient } from "@/lib/supabase/server";

function finish(error?: string): never {
  redirect(`/conta${error ? `?erro=${encodeURIComponent(error)}` : "?ok=1"}`);
}

export async function changePassword(formData: FormData) {
  const actor = await requireTeam();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!acceptablePassword(next)) finish("senha");
  if (next !== confirm) finish("confirma");

  const [account] = await db()`select password_hash from ctl_team_members where user_id = ${actor.userId}`;
  if (account?.password_hash) {
    if (!verifyPassword(current, account.password_hash)) finish("atual");
    await db()`update ctl_team_members set password_hash = ${hashPassword(next)} where user_id = ${actor.userId}`;
    finish();
  }

  const supabase = await createClient();
  const { error: check } = await supabase.auth.signInWithPassword({ email: actor.email, password: current });
  if (check) finish("atual");
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) finish("salvar");
  finish();
}
