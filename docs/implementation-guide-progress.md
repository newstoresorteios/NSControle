# Execução local do guia de 16/10/2026

## Preparação para publicação em 19/10/2026

- O usuário identificou o banco como `NS-db / main production` e aplicou a migração incremental. A consulta de retorno mostrou as cinco colunas com os tipos previstos (`supplier_name`, `supplier_purchase_date`, `tax_identified_at`, `source`, `source_occurrence`) e os dois índices (`ctl_orders_tax_identified_idx`, `ctl_cancellations_source_occurrence_uidx`). A aplicação foi feita pelo usuário; esta revisão não executou SQL no banco.
- Um teste de regressão reproduziu a sobrescrita do nome do produto editado em pedido de origem Tray. A mescla foi corrigida para preencher `product_name` apenas quando o campo está vazio, preservando nomes já preenchidos. Consequência: uma alteração posterior do produto na própria Tray não substitui automaticamente um nome existente no NSControle; essa escolha evita apagar a edição da equipe sem haver proveniência por campo.
- Validação local após a correção: 50 testes aprovados, 1 ignorado e 0 falhas; lint com 0 erros e 1 aviso anterior em `logo.tsx`; checagem de tipos, build e `git diff --check` aprovadas.
- A configuração local ainda não contém credenciais de login, banco ou Tray. Login, persistência após recarga, sincronização real e conciliação com planilha real permanecem sem validação integrada; os resultados com fixtures são sintéticos. A publicação e o teste operacional em produção precisam ser acompanhados com esses limites explícitos.

## Revisão do projeto em 19/10/2026

- Diretório confirmado: `C:\Users\jpfma\Downloads\NEWSTORE\NSControle`.
- Arquivos de ambiente encontrados no projeto, inclusive ignorados: somente `.env.example`. Nele, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `DATABASE_URL` estão vazios. As seis variáveis de Supabase/banco conferidas no processo também estavam ausentes. Nenhum valor de chave ou secret foi exibido.
- Verificação local após a revisão: 49 testes aprovados, 1 ignorado, 0 falhas; lint com 0 erros e 1 aviso anterior em `logo.tsx`; checagem de tipos e build aprovadas.
- Revisão do diff encontrou sobrescrita de `product_name`, `reference`, `payment_date` e `tracking_code` já preenchidos manualmente durante a mescla Tray/BI. Um teste com fixture falhou reproduzindo a troca do produto e passou depois da proteção dos quatro campos para registros de origem `manual` ou `planilha`.
- A revisão corrigiu uma informação desatualizada no README: `/api/tray/sync` autentica com `CRON_SECRET` ou `TRAY_SYNC_SECRET` e usa PostgreSQL; o helper `SUPABASE_SERVICE_ROLE_KEY` não é usado por essa rota.
- Risco funcional ainda aberto: a ficha de pedidos permite alterar `tax_paid` mesmo sem `tax_identified_at`, enquanto a fila mostra apenas pedidos identificados. A regra definitiva para esses registros depende de D4; não houve reclassificação automática.
- A proteção contra cancelamento duplicado da Tray tem índice para a ocorrência automática e verificação de lançamento manual existente, mas a concorrência com lançamentos manuais não foi exercitada em banco de desenvolvimento. D3 ainda define o tratamento de múltiplos reembolsos.
- Migração aditiva comparada com o esquema base: colunas novas e índice da fila de taxas estão preparados, mas não aplicados. A validação com banco exige confirmação independente de que o destino é de desenvolvimento.
- Login, acesso autenticado, cadastro, consulta, edição, persistência após recarga, concorrência e conciliação com planilha real permanecem sem validação integrada. O painel autenticado tem atualização automática de BI/Tray/Correios; futuras verificações devem isolar essas chamadas com fixtures/mocks para não acionar serviços reais.
- Nenhuma migração, importação, reimportação, sincronização externa, alteração de produção, commit, push ou deploy foi executado nesta revisão.

## Validação adicional de 16/10/2026

**Resultado:** implementação local revisada; validação integrada pendente. A build não comprova login, gravação ou conciliação real. Nenhuma migração foi aplicada e nenhum serviço externo foi chamado nesta validação. Não houve importação, reimportação, commit, push, deploy ou mudança em produção.

### Configuração de desenvolvimento

O código do aplicativo lê exatamente estas variáveis de ambiente:

| Variáveis | Uso e necessidade |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Obrigatórias para exibir e executar login**. São usadas pelo cliente, middleware e servidor Supabase. A chave `NEXT_PUBLIC_` é pública; nunca colocar chave de serviço nela. |
| `DATABASE_URL` **ou** `POSTGRES_URL` | **Obrigatória para painel e persistência**. `db.ts` usa a primeira não vazia; a conexão é PostgreSQL com SSL. O login autenticado também consulta `ctl_team_members` e `ctl_allowed_emails` nesse banco. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Lidas pelo helper de cliente de serviço, sem chamada encontrada no aplicativo atual. Não são necessárias para o login normal nem para a validação manual do painel. |
| `BI_API_URL` | Endpoint do BI; há URL externa padrão no código. A atualização automática do painel chama o BI, portanto só testar com mock/fixture isolado. |
| `TRAY_ADAPTER_URL`, `TRAY_ADAPTER_TOKEN` | Integração Tray; exige ambos. Permanecem vazios na validação local. |
| `TRAY_SYNC_SECRET`, `CRON_SECRET` | Autorização da rota de sincronização; qualquer um pode ser aceito. A rota não foi chamada. |
| `CORREIOS_API_URL`, `CORREIOS_USUARIO`, `CORREIOS_SENHA`, `CORREIOS_CARTAO`, `CORREIOS_CONTRATO`, `CORREIOS_DR` | Correios; usuário, senha e cartão são o trio necessário para ativar a integração. URL, contrato e DR são opcionais. Permanecem sem credenciais. |
| `INVOICE_AI_KEY`, `INVOICE_AI_URL`, `INVOICE_AI_MODEL` | Leitura opcional de faturas não cobertas pelos formatos locais. Nenhuma chamada foi feita. |

O `.env.example` foi mantido com os nomes que já existiam nele. A tabela acima também registra nomes encontrados no código, mas ausentes do exemplo; eles não foram adicionados à configuração. O `.env.local` de placeholders criado nesta validação foi removido para não sobrepor uma configuração preexistente. `.gitignore` ignora `.env*` e libera somente `.env.example`; `git check-ignore -v .env.local` apontou a regra `.gitignore:34:.env*`. Os scripts de importação antigos mencionam ainda `SUPABASE_ANON_KEY`, `CONTROLE_EMAIL`, `CONTROLE_PASSWORD` e `NS_XLSX`; essas variáveis **não são necessárias ao aplicativo** e os scripts não serão executados nesta validação.

Antes de qualquer migração: confirmar de forma independente que URL do Supabase e host/nome do PostgreSQL pertencem ao ambiente de desenvolvimento; obter autorização e acesso de teste; conferir o esquema existente e aplicar somente a migração aditiva. A presença de uma URL em qualquer arquivo não prova que o banco é de desenvolvimento. No `.env.example`, os campos de Supabase e banco estão vazios; as URLs públicas já existentes para BI e Tray não fornecem login ou banco. Outros arquivos ignorados do projeto ainda não foram identificados. Não usar credenciais de produção.

### Estado por etapa do guia

| Etapa | Estado | Evidência e pendência |
| --- | --- | --- |
| 0 — base e testes | **Implementada e testada** | Testes executados localmente; lint, tipos e build passaram. Nenhum ambiente ou banco foi provisionado. |
| 1 — compras de clientes e estoque | **Implementada, mas sem validação integrada** | Formulários e ações de cadastro/edição foram revisados; testes de validação cobrem valores e datas. Falta cadastrar, consultar, editar e recarregar com banco de desenvolvimento. |
| 2 — fornecedor e data separada | **Implementada, mas sem validação integrada** | Campos, UI e migração aditiva preparados. Falta aplicar a migração em banco de desenvolvimento confirmado e verificar persistência. |
| 3 — cancelamentos e reembolsos | **Implementada, mas sem validação integrada** | Criação transacional, edição e cálculo pelo mês de `done_date`; fixture sintética verifica fronteira de mês. Falta testar transação, concorrência e persistência com banco. Regime financeiro e reembolsos parciais dependem de D2/D3. |
| 4 — deduções e resultado | **Implementada, mas sem validação integrada** | Fixture sintética: venda 1000; compra 600; taxa de pagamento 30; frete 20; importação 50; taxas totalizam 100, custo 700 e resultado 300. Cada taxa entra uma vez na fórmula. Falta conciliar com dados reais. Classificação de loja velha depende de D1. |
| 5 — fila manual de taxas | **Implementada, mas sem validação integrada** | Ações de identificar, registrar valor e confirmar pagamento separadas; teste de estados da fila. Falta verificar UI, gravação e recarga. Critério definitivo de confirmação depende de D4. |
| 6 — sincronizações e preservação | **Implementada, mas sem validação integrada** | Fixtures de Tray, BI e Correios verificam preservação de origem, mês, data de compra manual e evento de rastreio mais recente. Falta prova de integração e concorrência com banco; não disparar sincronização real. Extração por RPA **não implementada**, bloqueada por D5. |
| Conciliação real com planilha | **Não implementada** | Nenhuma planilha autorizada ou amostra de legado disponível. As fixtures acima são sintéticas e não demonstram equivalência com dados reais. |

### Evidências e limite do fluxo integrado

- `npm test`: **49 aprovados, 1 ignorado, 0 falhas** após a conferência sintética adicional e o teste de preservação manual. O teste ignorado exige três PDFs reais não disponíveis para esse teste.
- `npm run lint`: **0 erros, 1 aviso** preexistente sobre `<img>` em `src/components/logo.tsx`. `npx tsc --noEmit` e `npm run build` também passaram após a correção da mescla.
- Servidor local verificado antes desta atualização: `/login` respondeu **200** e `/` respondeu **500**. O erro foi `Your project's URL and Key are required to create a Supabase client!`. Essa observação não comprova ausência de credenciais em outros arquivos do projeto; eles ainda precisam ser localizados sem revelar valores.
- Primeira fronteira bloqueada na execução observada: o servidor não carregou URL e chave do Supabase. Ainda é necessário localizar o arquivo de credenciais citado pelo usuário e confirmar que pertence ao ambiente de desenvolvimento. Não foram exercidos login, acesso ao painel, cadastro, consulta, edição, persistência após recarga nem fluxos integrados de compras, fornecedores, cancelamentos e taxas.
- `AutoRefresh` no layout autenticado chama `pullRemoteUpdates`, que aciona BI, Tray e Correios; o BI tem endpoint externo padrão mesmo sem variável. Para a futura validação integrada, isolar essas chamadas com mocks/fixtures antes de abrir o painel autenticado. Não usar a rota de sincronização nem botões de atualização contra serviços reais.
- **Conciliação sintética:** testes de função para mês do reembolso, dedução única e mesclas de sincronização. **Conciliação real:** não realizada; requer cópia autorizada da planilha e amostra do banco de desenvolvimento, com comparação pedido a pedido e decisão sobre D1–D4.

Base: `main`, commit `a33e98c`, árvore inicialmente limpa. O PDF descreve esse mesmo commit.
Não havia `AGENTS.md` no repositório. Nenhum banco, integração externa ou produção foi alterado.
Não houve commit, push ou deploy.

| Etapa | Comportamento anterior | Alteração local | Evidência e limite |
| --- | --- | --- | --- |
| 0 | `npm test` tentava criar subprocessos e falhava com `spawn EPERM`; lint/build sem dependências | Testes executados em um processo e teste BI incluído | `npm test`: 49 aprovados, 1 ignorado após os testes sintéticos. `npm run lint`: 0 erros, 1 aviso preexistente em `logo.tsx`. `npx tsc --noEmit` e `npm run build`: aprovados após a correção da mescla. |
| 1 | Compras não mostrava CPF/endereço nem editava registro; estoque só criava | Fichas de edição com campos permitidos, validação de ID/valor/data, preservação dos vínculos | `operational.test.ts` cobre data impossível, zeros e valor inválido. Persistência depende de banco local. |
| 2 | `purchase_date` era a única data de compra visível | Campos anuláveis `supplier_name` e `supplier_purchase_date`, SQL aditivo, ficha e acompanhamento | Migração preparada, não aplicada. Não há backfill. |
| 3 | Cancelamento não era editável; atualização do pedido e inclusão eram separadas | Transação na criação, edição de `done_date`, apuração mensal por essa data; Tray não presume valor devolvido | `refunds.test.ts` e `tray-map.test.ts`; concorrência no banco local ainda não exercitada. |
| 4 | Custos positivos apareciam sem sinal de dedução | Rótulos de dedução, indicação de resultado incompleto, validação de custos novos | Fórmula de `gain_amount` preservada; histórico não alterado. |
| 5 | Não havia confirmação explícita de cobrança | Coluna e fila manual de taxas; valor e pagamento separados | `taxes.test.ts`; requer migração antes do código. |
| 6 | Correios podia gravar evento mais antigo sobre evento recente; Tray podia regredir a data | Correios exige evento estritamente mais novo; Tray preserva a data de rastreio em pedidos existentes. Cobrança/pagamento seguem manuais | Testes de classificação e da mescla Tray; teste de concorrência real requer banco local. |
| Integrações | BI trocava `data_source` manual para `bi` | Origem manual preservada; leitura de mudanças inclui mês e frete | `bi-map.test.ts` falhou antes e passou depois. |

## Decisões pendentes

- **D1:** Identificador de “loja velha” e relação com encomenda. Impede classificação automática e correção histórica.
- **D2:** Regime financeiro principal (caixa ou competência). Reembolsos ficam em bloco separado.
- **D3:** Possibilidade de reembolsos parciais ou múltiplos. Integração registra apenas o sinal de cancelamento, sem presumir valor pago. Se já houver lançamento manual para o número, não cria outro sinal automático; lançamentos manuais adicionais continuam possíveis.
- **D4:** Confirmar a aba Taxas como posição definitiva e qual evidência comprova cobrança. A fila atual exige confirmação manual.
- **D5:** Sistema, documento e repositório do RPA. Extração automática não foi implementada.
- **Dados externos:** Planilha autorizada e amostra de legado para conciliação não foram fornecidas. Não há correção de sinais ou reclassificação em massa.

## Conferência com a planilha

Usar uma cópia autorizada, sem executar `import_pedidos.py` ou `load_neon.mjs`. Para cada
pedido da amostra, comparar identificador e loja, mês financeiro, venda, custo de compra,
taxa de pagamento, frete, taxa de importação, data e valor do reembolso. Manter os valores
da planilha e do banco em colunas separadas. O registro de divergências deve conter:

| Campo | Conteúdo a registrar |
| --- | --- |
| Pedido e loja | Chaves das duas fontes, incluindo a origem externa quando existir |
| Competência | Mês na planilha, mês no banco e critério adotado |
| Campo divergente | Venda, custo, taxa, frete, reembolso ou status |
| Valor esperado / atual | Valores preservados de cada fonte |
| Causa | Identificada ou “em investigação”, com evidência |
| Responsável | Pessoa que validará a diferença; Ramon valida a conciliação operacional |
| Decisão e data | Regra aprovada e data de conferência; sem alterar histórico antes da decisão |

## Ordem de implantação futura

1. Confirmar o destino como banco de desenvolvimento; revisar e aplicar nele a migração aditiva para a validação integrada. Não aplicar em produção nesta etapa.
2. Publicar o aplicativo compatível com as colunas.
3. Conferir, com Ramon, casos de compra, fornecedor, cancelamento, taxa e resultado, mantendo a planilha paralela.
4. Registrar diferenças por pedido com valor esperado, valor atual, causa e responsável; não sobrescrever dados para forçar totais.

Reversão inicial: voltar o código sem remover colunas nem dados. Não há `DROP` de rotina.
