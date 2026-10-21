# NS Controle

## Plataforma Europa separada

A operação Redirect foi extraída para uma aplicação independente em
[apps/integracao](apps/integracao/README.md), com login, sessão, navegação, estoque
operacional e publicação próprios. Ela não aparece no menu do NSControle.

No NSControle, a ficha do pedido oferece **Encaminhar pedido para a Europa /
acompanhar envio**. Apenas essa ponte acessa o estoque Europa para selecionar a
unidade. A plataforma da Ana recebe somente os envios atribuídos e devolve o rastreio.
O estoque Europa não é adicionado ao estoque interno do NSControle.

Instale o esquema aditivo antes de publicar:

```bash
node --env-file=.env.local scripts/setup-integracao.mjs
node --env-file=.env.local scripts/test-integracao-db.mjs
```

Use projetos de hospedagem separados: raiz deste repositório para NSControle e
`apps/integracao` para Europa. Configure `INTEGRACAO_URL` no NSControle quando a URL
da nova aplicação estiver disponível. O antigo endereço `/integracao` do NSControle
apenas direciona à plataforma separada, sem abrir o painel interno.

O banco PostgreSQL é compartilhado apenas como backend da ponte operacional nesta
fase; as sessões e autorizações são independentes. A equipe da Ana entra em
`ctl_integration_members`, sem precisar de acesso a `ctl_allowed_emails`.
Sendcloud e retorno automático do rastreio à Tray continuam para uma etapa posterior.

Painel interno de pedidos, financeiro, estoque, compras de clientes e cancelamentos.

## Ajustes operacionais de 16/10/2026

Antes de usar os novos campos de fornecedor e a fila de taxas, confirme que o banco de teste é
de desenvolvimento e só então revise e aplique nele a migração
`scripts/migrations/20261016_nscontrole_operational_fields.sql`. O código depende das colunas
novas. A aplicação em produção exige uma etapa separada; não há backfill.
Para voltar ao código anterior, mantenha as colunas e seus dados.

Em **Compras de clientes**, a ficha permite corrigir CPF, endereço e demais dados sem recriar a compra.
O cadastro de **Estoque** continua independente de pedido e a data de compra é opcional.
Em **Pedidos**, “Data do pedido de origem” e “Data da compra ao fornecedor” são campos distintos.
Em **Cancelamentos**, “Devolver até” é prazo e “Devolvido em” é a data efetiva. O financeiro
mostra reembolsos por essa data em um bloco separado; eles ainda não são abatidos do resultado.
Em **Financeiro > Taxas**, a equipe confirma a cobrança por pedido ou rastreio, informa o valor
e confirma o pagamento em ações separadas. A fila não executa pagamentos ou mensagens.

As regras ainda pendentes e a validação local estão em `docs/implementation-guide-progress.md`.
Mantenha a planilha em paralelo até conciliar uma amostra autorizada por pedido, loja,
competência, custo, taxa e reembolso. Os scripts de reimportação substituem dados e não fazem
parte deste fluxo de atualização.

```bash
npm install
npm run dev
```

Copie `.env.example` para `.env.local` e preencha a URL e a chave anon do projeto Supabase. O acesso exige um usuário em `ctl_allowed_emails` e em Authentication.

Para reimportar a planilha:

```bash
pip install -r scripts/requirements.txt
python scripts/import_pedidos.py
```

A importação grava `data/import_report.json` e, com as variáveis do `.env.local`, substitui os dados do controle.

## Loja (TRAYadaptor)

Com `TRAY_ADAPTER_URL` e `TRAY_ADAPTER_TOKEN` (o mesmo Bearer interno do adaptador), o painel puxa pedidos da loja ao ser aberto e pelo botão **Atualizar agora**. Cada rodada grava até 15 pedidos em `ctl_orders` no fluxo Loja nova: status, produto, venda, pagamento, rastreio, cancelamento e o frete da loja em `shipping_cost`. Custo de compra, taxa de importação, estoque físico e compras de clientes não vêm da Tray. Um custo de envio já preenchido na planilha ou na ficha manual permanece.

Fora do painel, a Vercel dispara `/api/tray/sync` uma vez por dia, às 8h de Brasília. No plano Hobby um cron mais frequente impede o deploy. Para rodar na hora:

```bash
curl -X POST "$APP_URL/api/tray/sync" -H "Authorization: Bearer $TRAY_SYNC_SECRET"
```

Esse caminho aceita `CRON_SECRET` ou `TRAY_SYNC_SECRET` no Bearer e usa a conexão PostgreSQL configurada no servidor. A rota atual não usa `SUPABASE_SERVICE_ROLE_KEY`. `?force=1` ignora a pausa de 8 minutos entre rodadas. A mesma chamada também consulta o último evento na API Rastro dos Correios; não a acione na validação local sem mocks.

## Rastreio (Correios)

Com `CORREIOS_USUARIO`, `CORREIOS_SENHA` (código de acesso das APIs no CWS) e `CORREIOS_CARTAO`, o painel grava o último evento em `tracking_correios` e classifica a fila: alfândega, devolução, problema, sem retorno ou em trânsito. A API só responde objetos do contrato de postagem. Valor da taxa e dados de pagamento não vêm dessa consulta.
