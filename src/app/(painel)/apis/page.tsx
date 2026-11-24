import { requireTeam } from "@/lib/auth";
import { API_CALLS, API_SEARCH } from "@/lib/api-catalog";
import { oneCopy } from "@/lib/operational";

export default async function ApisPage() {
  await requireTeam();
  const groups = ["Consultar", "Gravar"] as const;
  const token = oneCopy(process.env.CLAUDE_API_TOKEN || "");
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">APIs</h1>
        <p className="max-w-3xl text-sm text-muted">
          Manual para consultar o sistema, comparar com a planilha, completar o que está vazio
          e corrigir o que já foi gravado: pedido, compra, estoque, nota e pagamentos.
          A base é o endereço deste painel. Quem já está logado aqui chama direto, sem token.
          Uma chamada de fora envia <span className="font-mono"> Authorization: Bearer </span>
          com a senha abaixo.
        </p>
      </div>
      <section className="card">
        <h2 className="section-title">Senha de acesso</h2>
        <p className="mt-2 text-sm text-muted">Variável CLAUDE_API_TOKEN no servidor deste painel, na Vercel.</p>
        {token ? (
          <p className="mt-3 overflow-x-auto whitespace-nowrap font-mono text-sm">{token}</p>
        ) : (
          <p className="mt-3 text-sm">A senha ainda não está configurada neste servidor.</p>
        )}
      </section>
      <section className="card">
        <h2 className="section-title">Como pesquisar</h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {API_SEARCH.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {groups.map((group) => (
        <section key={group} className="grid gap-3">
          <h2 className="section-title">{group}</h2>
          {API_CALLS.filter((call) => call.group === group).map((call) => (
            <article key={call.id} className="card grid gap-3">
              <div>
                <p className="kicker">{call.method}</p>
                <h3 className="mt-2 text-base font-medium">{call.title}</h3>
                <p className="mt-1 font-mono text-sm">{call.path}</p>
                <p className="mt-2 text-sm text-muted">{call.use}</p>
              </div>
              {call.params.length ? (
                <dl className="grid gap-2 text-sm">
                  {call.params.map((field) => (
                    <div key={field.name} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
                      <dt className="font-mono">{field.name}</dt>
                      <dd className="text-muted">{field.text}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {call.body ? <pre className="overflow-x-auto text-sm">{call.body}</pre> : null}
              <p className="text-sm">Devolve: {call.returns}</p>
              <p className="text-sm text-muted">{call.rule}</p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
