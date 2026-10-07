import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { USER_EMAIL_HEADER, USER_ID_HEADER, requestUser } from "@/lib/request-user";
import { createClient } from "@/lib/supabase/server";

export const requireTeam = cache(async function requireTeam() {
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
  const members = await sql<{ email: string }[]>`
    select email from ctl_team_members where user_id = ${userId} limit 1
  `;
  if (!members.length) {
    const allowed = await sql<{ email: string }[]>`
      select email from ctl_allowed_emails where email = ${email} limit 1
    `;
    if (!allowed.length) {
      const supabase = await createClient();
      await supabase.auth.signOut();
      redirect("/login?erro=acesso");
    }
    await sql`
      insert into ctl_team_members (user_id, email)
      values (${userId}, ${email})
      on conflict (user_id) do update set email = excluded.email
    `;
  }

  return { email: members[0]?.email ?? email };
});
