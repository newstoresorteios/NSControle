import Link from 'next/link';
import { requireOperator } from '@/lib/auth';
import { signOut } from '@/app/login/actions';

export const dynamic='force-dynamic';
export default async function OperationLayout({children}: {children:React.ReactNode}) {
  const {email}=await requireOperator();
  return <div className="min-h-screen bg-paper"><header className="border-b border-line bg-white print:hidden"><div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-5"><Link href="/integracao"><p className="text-xs uppercase tracking-widest text-muted">New Store × Redirect</p><p className="text-xl font-medium">Plataforma Europa</p></Link><form action={signOut} className="flex items-center gap-4"><span className="text-xs text-muted">{email}</span><button className="secondary">Sair</button></form></div><nav className="mx-auto flex max-w-[1400px] flex-wrap gap-6 px-5 pb-4 text-sm"><Link href="/integracao#recebimento">Recebimento</Link><Link href="/integracao#estoque">Estoque</Link><Link href="/integracao#expedicao">Expedição</Link><Link href="/integracao#historico">Histórico</Link></nav></header><main className="mx-auto max-w-[1400px] px-5 py-8">{children}</main></div>;
}
