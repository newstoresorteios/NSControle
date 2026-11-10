import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUser, updateUser } from "./actions";
import { DeleteUser } from "./delete-user";

const ERRORS: Record<string, string> = {
  invalido: "Informe um usuário em letras minúsculas, sem espaços, e um nome.",
  senha: "A senha precisa ter de 6 a 72 caracteres.",
  existe: "Esse usuário já existe.",
  ultimo: "Mantenha pelo menos um admin.",
  proprio: "Você não pode excluir a própria conta.",
  email: "Essa conta entra por e-mail. A senha dela é alterada pelo ícone de usuário.",
  salvar: "Não foi possível salvar o usuário.",
};

const DONE: Record<string, string> = {
  criado: "Usuário incluído.",
  salvo: "Usuário atualizado.",
  excluido: "Usuário excluído.",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const actor = await requireAdmin();
  const params = await searchParams;
  const users = await db()`
    select user_id, email, username, display_name, role, password_hash is not null as local
    from ctl_team_members
    order by username nulls last, email
  `;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="page-title">Usuários</h1>
        <p className="text-muted">Inclua, altere ou exclua o acesso ao NSControle. A senha inicial sugerida é 123456.</p>
      </header>
      {params.erro ? <p role="alert" className="card text-danger">{ERRORS[params.erro] || "Não foi possível concluir."}</p> : null}
      {params.ok ? <p role="status" className="text-ok">{DONE[params.ok] || "Operação concluída."}</p> : null}
      <section className="card">
        <h2 className="section-title">Novo usuário</h2>
        <form action={createUser} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="grid gap-1">Usuário<input name="username" required maxLength={31} autoComplete="off" /></label>
          <label className="grid gap-1">Nome<input name="display_name" required maxLength={80} /></label>
          <label className="grid gap-1">Perfil
            <select name="role" defaultValue="membro">
              <option value="membro">Membro</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="grid gap-1">Senha<input name="password" type="text" defaultValue="123456" required minLength={6} maxLength={72} /></label>
          <button className="w-fit">Incluir</button>
        </form>
      </section>
      <section className="card overflow-x-auto">
        <table>
          <thead>
            <tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Senha</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const own = user.user_id === actor.userId;
              const login = user.username || user.email;
              return (
                <tr key={user.user_id}>
                  <td>{login}</td>
                  <td colSpan={4}>
                    <form action={updateUser} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={user.user_id} />
                      <label className="grid min-w-40 flex-1 gap-1">Nome
                        <input name="display_name" defaultValue={user.display_name || login} required maxLength={80} />
                      </label>
                      <label className="grid w-36 gap-1">Perfil
                        <select name="role" defaultValue={user.role} disabled={own}>
                          <option value="membro">Membro</option>
                          <option value="admin">Admin</option>
                        </select>
                        {own ? <input type="hidden" name="role" value={user.role} /> : null}
                      </label>
                      <label className="grid min-w-40 flex-1 gap-1">Nova senha
                        <input name="password" type="text" placeholder={user.local ? "Manter a atual" : "Pelo ícone do usuário"} disabled={!user.local} maxLength={72} />
                      </label>
                      <button className="ok" type="submit">Salvar</button>
                      {own ? null : <DeleteUser id={user.user_id} name={user.display_name || login} />}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
