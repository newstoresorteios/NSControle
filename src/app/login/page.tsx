import { signIn } from "@/app/login/actions";
import { Logo } from "@/components/logo";

const MESSAGES: Record<string, string> = {
  credencial: "E-mail ou senha não conferem.",
  acesso: "Esse usuário não está liberado no time do controle.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const params = await searchParams;
  const message = params.erro ? MESSAGES[params.erro] : null;
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="bg-ink px-4 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-white">
        New Store · Controle interno
      </div>
      <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-6 py-12">
        <section className="border border-line bg-white px-8 py-10">
          <Logo height={28} />
          <p className="kicker mt-8">Acesso do time</p>
          <h1 className="page-title mt-2">Entrar</h1>
          <p className="mt-3 text-sm text-muted">
            Painel interno de pedidos, financeiro e estoque.
          </p>
          {message ? (
            <p className="mt-4 border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{message}</p>
          ) : null}
          {!configured ? (
            <p className="mt-4 text-sm">
              Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para entrar.
            </p>
          ) : (
            <form action={signIn} className="mt-8 grid gap-4">
              <label className="grid gap-1.5">
                E-mail
                <input name="email" type="email" autoComplete="username" required />
              </label>
              <label className="grid gap-1.5">
                Senha
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button className="mt-2" type="submit">
                Entrar
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
