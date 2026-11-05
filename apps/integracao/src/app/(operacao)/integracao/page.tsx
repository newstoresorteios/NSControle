import { requireOperator } from '@/lib/auth';
import { ReceiveDialog } from './receive-dialog';
import { Notice } from './ui';

export default async function RecebimentoPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireOperator();
  const params = await searchParams;
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">New Store × Redirect Europa</p>
        <h1 className="page-title mt-2">Recebimento</h1>
        <p className="text-muted">Cadastro da unidade física quando o relógio chega. O ID é gerado automaticamente.</p>
      </header>
      <Notice ok={params.ok} erro={params.erro} />
      <ReceiveDialog />
    </div>
  );
}
