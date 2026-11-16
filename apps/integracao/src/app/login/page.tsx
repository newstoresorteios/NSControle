import { Logo } from "@/components/logo";
import { signIn } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const message = erro === "acesso"
    ? "Usuário sem acesso à plataforma Europa."
    : erro
      ? "E-mail ou senha não conferem."
      : null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="bg-ink px-4 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-white">
        New Store · Plataforma Europa
      </div>
      <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-6 py-12">
        <section className="border border-line bg-white px-8 py-10">
          <Logo height={28} />
          <p className="kicker mt-8">Acesso da operação</p>
          <h1 className="page-title mt-2">Entrar</h1>
          <p className="mt-3 text-sm text-muted">
            Compras, recebimento, estoque e expedição.
          </p>
          {message ? (
            <p role="alert" className="mt-4 border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{message}</p>
          ) : null}
          <form action={signIn} className="mt-8 grid gap-4">
            <label className="grid gap-1.5">
              E-mail
              <input name="email" type="text" autoComplete="username" required />
            </label>
            <label className="grid gap-1.5">
              Senha
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="mt-2" type="submit">Entrar</button>
          </form>
        </section>
      </main>
    </div>
  );
}
