import { redirect } from 'next/navigation';

export const metadata = {title:'Plataforma Europa'};
export default function IntegrationEntry() {
  const target=process.env.INTEGRACAO_URL;
  if (target) redirect(new URL('/integracao',target).toString());
  return <main className="mx-auto flex min-h-screen max-w-lg items-center px-6"><section className="card"><p className="text-xs uppercase tracking-widest text-muted">New Store × Redirect</p><h1 className="page-title mt-3">Plataforma Europa</h1><p className="mt-4 text-muted">A operação Europa possui um sistema separado. O endereço de acesso será disponibilizado após a publicação da plataforma.</p></section></main>;
}
