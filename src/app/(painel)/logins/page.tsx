import { createEntry, updateEntry } from "@/app/(painel)/logins/actions";
import { VaultSecret } from "@/components/vault-secret";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

type Entry = {
  id: string;
  kind: "login" | "link";
  name: string;
  url: string | null;
  account: string | null;
  note: string | null;
  locked: boolean;
};

function externalHref(value: string | null) {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  return value;
}

export default async function LoginsPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const rows = await db()<Entry[]>`
    select id, kind, name, url, account, note, secret is not null as locked
    from ctl_vault_entries
    order by kind, position, name
  `;
  const logins = rows.filter((row) => row.kind === "login");
  const links = rows.filter((row) => row.kind === "link");

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Logins e Links</h1>
        <p className="text-muted">
          Sistemas externos da equipe. A senha fica cifrada e só abre para quem está logado neste painel.
        </p>
      </div>
      {params.erro ? <p className="text-sm text-danger">Não foi possível salvar.</p> : null}
      {params.ok ? <p className="text-sm text-ok">Registro atualizado.</p> : null}
      <details className="card">
        <summary className="section-title">Novo registro</summary>
        <EntryForm action={createEntry} />
      </details>
      <section className="grid gap-3">
        <h2 className="section-title">Logins</h2>
        <div className="card sheet">
          <table>
            <thead>
              <tr>
                <th>Local</th>
                <th>Site</th>
                <th>Login</th>
                <th>Senha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logins.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.name}</div>
                    {row.note ? <div className="text-xs text-muted">{row.note}</div> : null}
                  </td>
                  <td>{linkOf(row.url)}</td>
                  <td>{row.account || "—"}</td>
                  <td><VaultSecret id={row.id} locked={row.locked} /></td>
                  <td>
                    <details>
                      <summary className="cursor-pointer underline">Editar</summary>
                      <EntryForm action={updateEntry} entry={row} />
                    </details>
                  </td>
                </tr>
              ))}
              {!logins.length ? (
                <tr>
                  <td colSpan={5}>Nenhum login cadastrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="section-title">Links</h2>
        <div className="card sheet">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.name}</div>
                    {row.note ? <div className="text-xs text-muted">{row.note}</div> : null}
                  </td>
                  <td>{linkOf(row.url)}</td>
                  <td>
                    <details>
                      <summary className="cursor-pointer underline">Editar</summary>
                      <EntryForm action={updateEntry} entry={row} />
                    </details>
                  </td>
                </tr>
              ))}
              {!links.length ? (
                <tr>
                  <td colSpan={3}>Nenhum link cadastrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function linkOf(value: string | null) {
  const href = externalHref(value);
  if (!value) return <span className="text-muted">—</span>;
  if (!href) return <span className="clip" title={value}>{value}</span>;
  return (
    <a className="clip underline" href={href} target="_blank" rel="noreferrer" title={value}>
      {value}
    </a>
  );
}

function EntryForm({
  action,
  entry,
}: {
  action: (formData: FormData) => void | Promise<void>;
  entry?: Entry;
}) {
  return (
    <form action={action} className="mt-3 grid min-w-72 gap-3 md:grid-cols-2">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <label className="grid gap-1 text-sm">
        Tipo
        <select name="kind" defaultValue={entry?.kind ?? "login"}>
          <option value="login">Login</option>
          <option value="link">Link</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Nome
        <input name="name" required defaultValue={entry?.name ?? ""} />
      </label>
      <label className="grid gap-1 text-sm md:col-span-2">
        Site ou link
        <input name="url" defaultValue={entry?.url ?? ""} placeholder="https://" />
      </label>
      <label className="grid gap-1 text-sm">
        Login
        <input name="account" defaultValue={entry?.account ?? ""} autoComplete="off" />
      </label>
      <label className="grid gap-1 text-sm">
        Senha
        <input name="secret" type="password" autoComplete="new-password" placeholder={entry ? "em branco mantém a atual" : ""} />
      </label>
      <label className="grid gap-1 text-sm md:col-span-2">
        Observação
        <input name="note" defaultValue={entry?.note ?? ""} />
      </label>
      <button className="ok md:w-fit" type="submit">{entry ? "Salvar" : "Cadastrar"}</button>
    </form>
  );
}
