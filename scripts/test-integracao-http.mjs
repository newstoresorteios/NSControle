import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';

const base = process.env.TEST_APP_URL || 'http://localhost:3100';
const cookies = new Map();
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies:{getAll:()=>Array.from(cookies,([name,value])=>({name,value})),setAll:values=>values.forEach(c=>cookies.set(c.name,c.value))},
});
const {error} = await client.auth.signInWithPassword({email:process.env.CONTROLE_EMAIL,password:process.env.CONTROLE_PASSWORD});
if (error) throw new Error('Não foi possível autenticar a conta de teste configurada.');
try {
  const cookie = Array.from(cookies,([name,value])=>`${name}=${value}`).join('; ');
  const response = await fetch(`${base}/integracao`,{headers:{cookie}});
  assert.equal(response.status,200);
  const html = await response.text();
  for (const expected of ['Receber relógio','Selecionar unidade para envio','Últimas movimentações']) assert.ok(html.includes(expected),`Ausente: ${expected}`);
  assert.ok(!html.includes('Internal Server Error'));
  const denied = await fetch(`${base}/integracao`,{redirect:'manual',headers:{'x-controle-user-id':'00000000-0000-0000-0000-000000000000','x-controle-user-email':'fake@example.com'}});
  assert.ok([303,307,308].includes(denied.status));
  assert.ok(denied.headers.get('location')?.includes('/login'));
  const photo = await fetch(`${base}/integracao/foto/invalid`,{headers:{cookie}});
  assert.equal(photo.status,404);
  console.log('OK: página autenticada renderizada, acesso sem sessão bloqueado e foto inválida retorna 404.');
} finally { await client.auth.signOut({scope:'local'}); }
