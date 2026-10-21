# Plataforma Europa

Aplicação Next.js independente do NSControle, com build, servidor, login, sessão
e interface próprios. A página operacional fica em `/integracao` neste aplicativo.
Não possui as rotas de financeiro, compras ou administração do NSControle.

## Executar

Copie `.env.example` para `.env.local` neste diretório e configure as variáveis.
Na raiz do repositório, execute `npm run dev:europa` (porta 3200). Na aplicação,
`npm install`, `npm run build` e `npm start` funcionam independentemente.

## Publicar

Crie um projeto de hospedagem separado com **Root Directory `apps/integracao`**.
Configure as três variáveis de `.env.example`. Não copie as credenciais Tray,
Correios, IA, BI ou outros segredos do NSControle para este projeto.
O domínio pode ser escolhido depois. A URL temporária fornecida pela hospedagem
já pode ser usada. Configure `INTEGRACAO_URL` no projeto NSControle com essa URL.

## Identidade e dados

É possível usar o mesmo Supabase Auth, mas os cookies têm nome exclusivo
`redirect-europa-auth` e o acesso exige um registro explícito em
`ctl_integration_members`. Usuários Redirect **não** devem ser cadastrados em
`ctl_allowed_emails` nem em `ctl_team_members`.

Os dados operacionais ficam em `ctl_integration_stock`, `ctl_integration_units`,
`ctl_integration_shipments` e `ctl_integration_events`. O estoque interno do
NSControle permanece separado. Nesta fase as aplicações usam o mesmo PostgreSQL
para a ponte transacional: NSControle encaminha o pedido e a reserva; Europa vê
apenas os pedidos atribuídos, registra o preparo e devolve o rastreio. Isso não
constitui dois bancos isolados: para isolar também as credenciais do banco,
uma etapa adicional deve substituir a ponte por API autenticada.

Para instalar/atualizar o banco, execute na raiz:

```bash
node --env-file=.env.local scripts/setup-integracao.mjs
```

Cadastre o usuário no Supabase Auth e seu email em minúsculas em
`ctl_integration_members`, com `role = 'redirect'` para equipe Europa ou
`role = 'newstore'` para administração operacional. A migração autoriza os usuários
internos existentes na plataforma, sem modificar os acessos internos do NSControle.
