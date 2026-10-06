# NS Controle

Painel interno de pedidos, financeiro, estoque, compras de clientes e cancelamentos.

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

Esse caminho usa `SUPABASE_SERVICE_ROLE_KEY`. `?force=1` ignora a pausa de 8 minutos entre rodadas. A mesma chamada também consulta o último evento na API Rastro dos Correios.

## Rastreio (Correios)

Com `CORREIOS_USUARIO`, `CORREIOS_SENHA` (código de acesso das APIs no CWS) e `CORREIOS_CARTAO`, o painel grava o último evento em `tracking_correios` e classifica a fila: alfândega, devolução, problema, sem retorno ou em trânsito. A API só responde objetos do contrato de postagem. Valor da taxa e dados de pagamento não vêm dessa consulta.
