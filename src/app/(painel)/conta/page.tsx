import { requireTeam } from "@/lib/auth";
import { changePassword } from "./actions";

const ERRORS: Record<string, string> = {
  atual: "A senha atual não confere.",
  confirma: "A confirmação não é igual à nova senha.",
  senha: "A nova senha precisa ter de 6 a 72 caracteres.",
  salvar: "Não foi possível alterar a senha.",
};

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const actor = await requireTeam();
  const params = await searchParams;
  return (
    <div className="grid max-w-md gap-6">
      <header>
        <h1 className="page-title">Alterar senha</h1>
        <p className="text-muted">{actor.displayName}</p>
      </header>
      {params.erro ? <p role="alert" className="card text-danger">{ERRORS[params.erro] || "Não foi possível alterar a senha."}</p> : null}
      {params.ok ? <p role="status" className="text-ok">Senha alterada.</p> : null}
      <form action={changePassword} className="card grid gap-3">
        <label className="grid gap-1">Senha atual<input name="current" type="password" autoComplete="current-password" required /></label>
        <label className="grid gap-1">Nova senha<input name="next" type="password" autoComplete="new-password" required minLength={6} maxLength={72} /></label>
        <label className="grid gap-1">Confirmar nova senha<input name="confirm" type="password" autoComplete="new-password" required minLength={6} maxLength={72} /></label>
        <button className="w-fit" type="submit">Salvar senha</button>
      </form>
    </div>
  );
}
