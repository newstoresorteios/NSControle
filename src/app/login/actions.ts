"use server";

import { redirect } from "next/navigation";
import { accountEmail, validUsername } from "@/lib/accounts";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { clearSession, writeSession } from "@/lib/session-cookie";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const login = String(formData.get("login") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!login.includes("@")) {
    if (!validUsername(login)) redirect("/login?erro=credencial");
    const [account] = await db()`
      select user_id, email, password_hash from ctl_team_members where username = ${login} limit 1
    `;
    if (!account?.password_hash || !verifyPassword(password, account.password_hash)) redirect("/login?erro=credencial");
    const supabase = await createClient();
    await supabase.auth.signOut();
    await writeSession({ id: account.user_id, email: account.email || accountEmail(login) });
    redirect("/");
  }

  await clearSession();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: login, password });
  if (error) redirect("/login?erro=credencial");
  redirect("/");
}

export async function signOut() {
  await clearSession();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
