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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Logo height={44} />
      <h1 className="mt-4 text-3xl font-semibold">NS Controle</h1>
      <p className="mt-2 text-[#6d645b]">
        Painel interno de pedidos, financeiro e estoque. O acesso é só para o time.
      </p>
      {message ? <p className="mt-4 rounded-md bg-[#f6e4dc] px-3 py-2 text-sm">{message}</p> : null}
      {!configured ? (
        <p className="mt-4 text-sm">
          Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para entrar.
        </p>
      ) : (
        <form action={signIn} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm">
            E-mail
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="grid gap-1 text-sm">
            Senha
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Entrar</button>
        </form>
      )}
    </main>
  );
}
