import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { USER_EMAIL_HEADER, USER_ID_HEADER, requestUser } from "@/lib/request-user";
import { clearSession } from "@/lib/session-cookie";
import { createClient } from "@/lib/supabase/server";

export type TeamActor = {
  userId: string;
  email: string;
  role: "admin" | "membro";
  displayName: string;
};

export const requireTeam = cache(async function requireTeam(): Promise<TeamActor> {
  const headerStore = await headers();
  const forwarded = requestUser(headerStore.get(USER_ID_HEADER), headerStore.get(USER_EMAIL_HEADER));
  let userId = forwarded?.id ?? "";
  let email = forwarded?.email ?? "";

  if (!userId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) redirect("/login");
    userId = user.id;
    email = user.email.toLowerCase();
  }

  const sql = db();
  const [partner] = await sql`select email from ctl_integration_members where email=${email} and role='redirect'`;
  if (partner) redirect("/login?erro=plataforma");
  let [member] = await sql<{ email: string; role: string; display_name: string | null; username: string | null }[]>`
    select email, role, display_name, username from ctl_team_members where user_id = ${userId} limit 1
  `;
  if (!member) {
    const allowed = await sql<{ email: string }[]>`
      select email from ctl_allowed_emails where email = ${email} limit 1
    `;
    if (!allowed.length) {
      await clearSession();
      const supabase = await createClient();
      await supabase.auth.signOut();
      redirect("/login?erro=acesso");
    }
    await sql`
      insert into ctl_team_members (user_id, email)
      values (${userId}, ${email})
      on conflict (user_id) do update set email = excluded.email
    `;
    [member] = await sql<{ email: string; role: string; display_name: string | null; username: string | null }[]>`
      select email, role, display_name, username from ctl_team_members where user_id = ${userId} limit 1
    `;
  }

  return {
    userId,
    email: member?.email ?? email,
    role: member?.role === "admin" ? "admin" : "membro",
    displayName: member?.display_name || member?.username || member?.email || email,
  };
});

export async function requireAdmin() {
  const actor = await requireTeam();
  if (actor.role !== "admin") redirect("/");
  return actor;
}
