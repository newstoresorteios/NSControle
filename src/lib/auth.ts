import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function requireTeam() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const sql = db();
  const email = user.email.toLowerCase();
  const members = await sql<{ email: string }[]>`
    select email from ctl_team_members where user_id = ${user.id} limit 1
  `;
  if (!members.length) {
    const allowed = await sql<{ email: string }[]>`
      select email from ctl_allowed_emails where email = ${email} limit 1
    `;
    if (!allowed.length) {
      await supabase.auth.signOut();
      redirect("/login?erro=acesso");
    }
    await sql`
      insert into ctl_team_members (user_id, email)
      values (${user.id}, ${email})
      on conflict (user_id) do update set email = excluded.email
    `;
  }

  return { user, email: members[0]?.email ?? email };
}
