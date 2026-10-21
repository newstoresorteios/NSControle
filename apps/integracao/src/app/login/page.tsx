import { signIn } from './actions';
export default async function Login({searchParams}: {searchParams:Promise<{erro?:string}>}) {
  const {erro}=await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-6"><section className="card w-full p-8"><p className="text-xs uppercase tracking-widest text-muted">New Store × Redirect Europa</p><h1 className="page-title mt-3">Plataforma Europa</h1><p className="mt-3 text-sm text-muted">Acesso à operação de recebimento, estoque e expedição.</p>{erro ? <p role="alert" className="mt-4 text-danger">{erro==='acesso' ? 'Usuário sem acesso à plataforma Europa.' : 'E-mail ou senha não conferem.'}</p> : null}<form action={signIn} className="mt-6 grid gap-4"><label>E-mail<input name="email" type="email" autoComplete="username" required/></label><label>Senha<input name="password" type="password" autoComplete="current-password" required/></label><button>Entrar na plataforma</button></form></section></main>;
}
