import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import postgres from 'postgres';

const base = process.env.TEST_APP_URL || 'http://localhost:3100';
const europa = process.env.TEST_EUROPA_URL || 'http://localhost:3200';
const cookies = new Map();
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookieOptions:{name:'redirect-europa-auth',sameSite:'lax',path:'/'},
  cookies:{getAll:()=>Array.from(cookies,([name,value])=>({name,value})),setAll:values=>values.forEach(c=>cookies.set(c.name,c.value))},
});
const {error} = await client.auth.signInWithPassword({email:process.env.CONTROLE_EMAIL,password:process.env.CONTROLE_PASSWORD});
if (error) throw new Error('Não foi possível autenticar a conta de teste configurada.');
try {
  const cookie = Array.from(cookies,([name,value])=>`${name}=${value}`).join('; ');
  const response = await fetch(`${europa}/integracao`,{headers:{cookie}});
  assert.equal(response.status,200);
  const html = await response.text();
  for (const expected of ['Receber relógio','Plataforma Europa','Últimas movimentações']) assert.ok(html.includes(expected),`Ausente: ${expected}`);
  for (const forbidden of ['href="/financeiro"','href="/pedidos"','href="/pagamentos"','New Store · Controle interno','Selecionar unidade para envio']) assert.ok(!html.includes(forbidden),`Conteúdo interno exposto: ${forbidden}`);
  assert.ok(!html.includes('Internal Server Error'));
  const denied = await fetch(`${europa}/integracao`,{redirect:'manual',headers:{'x-controle-user-id':'00000000-0000-0000-0000-000000000000','x-controle-user-email':'fake@example.com'}});
  assert.ok([303,307,308].includes(denied.status));
  assert.ok(denied.headers.get('location')?.includes('/login'));
  const photo = await fetch(`${europa}/integracao/foto/invalid`,{headers:{cookie}});
  assert.equal(photo.status,404);
  const isolated=await fetch(`${base}/pedidos`,{headers:{cookie},redirect:'manual'});
  assert.ok([303,307,308].includes(isolated.status),'Cookie Europa não pode autenticar no NSControle');
  const finance=await fetch(`${europa}/financeiro`,{headers:{cookie},redirect:'manual'});
  assert.equal(finance.status,404,'Europa não deve conter financeiro do NSControle');
  const mainCookies=new Map();
  const mainClient=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
    cookies:{getAll:()=>Array.from(mainCookies,([name,value])=>({name,value})),setAll:values=>values.forEach(c=>mainCookies.set(c.name,c.value))},
  });
  const mainLogin=await mainClient.auth.signInWithPassword({email:process.env.CONTROLE_EMAIL,password:process.env.CONTROLE_PASSWORD});
  assert.equal(mainLogin.error,null);
  try {
    const mainCookie=Array.from(mainCookies,([name,value])=>`${name}=${value}`).join('; ');
    const cross=await fetch(`${europa}/integracao`,{headers:{cookie:mainCookie},redirect:'manual'});
    assert.ok([303,307,308].includes(cross.status),'Cookie NSControle não pode autenticar na Europa');
    const sql=postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL,{ssl:'require',max:1,prepare:false});
    try {
      const [order]=await sql`select id from ctl_orders order by created_at desc limit 1`;
      if (order) {
        const bridge=await fetch(`${base}/pedidos/${order.id}/envio`,{headers:{cookie:mainCookie}});
        assert.equal(bridge.status,200);
        assert.ok((await bridge.text()).includes('Envio Europa'));
      }
    } finally {await sql.end();}
  } finally {await mainClient.auth.signOut({scope:'local'});}
  console.log('OK: duas aplicações autenticadas, sessões isoladas, sem painel NSControle na Europa e ponte do pedido funcional.');
} finally { await client.auth.signOut({scope:'local'}); }
