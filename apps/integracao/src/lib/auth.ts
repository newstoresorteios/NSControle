import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

// Platform membership is independent from the NSControle allowlist and team table.
export const requireOperator = cache(async () => {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  const email = user.email.toLowerCase();
  const [member] = await db()`select role from ctl_integration_members where email=${email}`;
  if (!member) redirect('/login?erro=acesso');
  return {email,role:String(member.role)};
});
