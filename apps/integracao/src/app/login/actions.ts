'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

export async function signIn(data:FormData) {
  const email=String(data.get('email') || '').trim().toLowerCase();
  const password=String(data.get('password') || '');
  const supabase=await createClient();
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if (error) redirect('/login?erro=credencial');
  const [member]=await db()`select email from ctl_integration_members where email=${email}`;
  if (!member) { await supabase.auth.signOut({scope:'local'}); redirect('/login?erro=acesso'); }
  redirect('/integracao');
}
export async function signOut() {
  const supabase=await createClient();
  await supabase.auth.signOut({scope:'local'});
  redirect('/login');
}
