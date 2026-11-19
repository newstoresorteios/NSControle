import { requireTeam } from "@/lib/auth";
import { claudeConfigured } from "@/lib/claude-api";

const CALLS = [
  {
    method: "GET",
    path: "/api/claude?recurso=pedidos&mes=2026-11",
    text: "Lista os pedidos aprovados do mês, com venda, compra, taxa de pagamento, frete, alfândega e rastreio.",
  },
  {
    method: "GET",
    path: "/api/claude?recurso=financeiro&mes=2026-11",
    text: "Totais do mês e a divisão por loja: venda, compra, frete, alfândega, taxa de pagamento e lucro.",
  },
  {
    method: "GET",
    path: "/api/claude?recurso=sem-rastreio",
    text: "Pedidos aprovados há mais de 15 dias que ainda não têm código de rastreio.",
  },
  {
    method: "POST",
    path: "/api/claude",
    text: "Preenche só o que está em branco: taxa de pagamento, compra, alfândega, frete, rastreio, origem e observação.",
  },
];

export default async function ApisPage() {
  await requireTeam();
  const ready = claudeConfigured();
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">APIs para o Claude</h1>
        <p className="max-w-3xl text-sm text-muted">
          Cada chamada usa o cabeçalho Authorization: Bearer e o valor de CLAUDE_API_TOKEN.
          Um campo que já tem valor na ficha permanece. O lucro é calculado pela ficha e não é gravado por aqui.
        </p>
      </div>
      <p className={ready ? "text-sm text-ok" : "text-sm text-danger"}>
        {ready ? "O token da API está configurado neste ambiente." : "Falta CLAUDE_API_TOKEN neste ambiente. A API responde indisponível até o token existir."}
      </p>
      <section className="grid gap-3">
        {CALLS.map((call) => (
          <article key={call.path} className="card">
            <p className="kicker">{call.method}</p>
            <p className="mt-2 font-mono text-sm">{call.path}</p>
            <p className="mt-2 text-sm text-muted">{call.text}</p>
          </article>
        ))}
      </section>
      <section className="card">
        <h2 className="section-title">Exemplo para gravar a taxa de pagamento</h2>
        <pre className="mt-3 overflow-x-auto text-sm">{`{
  "pedido": "26194",
  "taxa_pagamento": 18.9,
  "compra": 8010,
  "alfandega": 46.74,
  "frete": 49.14,
  "rastreio": "AB123456789BR",
  "origem": "Europa"
}`}</pre>
      </section>
    </div>
  );
}
