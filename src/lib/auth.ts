import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireTeam() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("ctl_team_members")
    .select("email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    await supabase.auth.signOut();
    redirect("/login?erro=acesso");
  }

  return { supabase, user, email: member.email as string };
}
