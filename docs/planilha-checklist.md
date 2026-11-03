# Checklist da planilha e diff

## Fórmulas do dashboard (Financeiro MMYY)

Conferidas na análise da v3 (`Financeiro 1026`). Corrigir na planilha Excel (fora do repo):

1. **Custo de compra (E5)** — não apontar para o bloco `TAXAS`. Usar o intervalo das linhas de venda (antes de `TAXAS` / `Pronta Entrega`), coluna de compra.
2. **Total Loja Nova / Pronta Entrega (C5)** — somar só o bloco `Pronta Entrega` (ou Loja nova), sem incluir encomenda.
3. **Total Sob Encomenda (D5)** — somar só encomenda; **não** incluir o range da Pronta Entrega (evita double-count na meta `C5+D5`).
4. **Resultado Final (H5)** — vendas totais únicas − (compra + taxas/envios), não só encomenda − taxas com compra zerada.
5. **Médias (G14–J14)** — eliminar `#REF!` / `#NUM!`; medianas sobre as colunas corretas de taxa, frete e ganho.
6. **Título do mês** — alinhar o texto “Controle Financeiro de …” ao nome da aba (`1026` = outubro, etc.).

O painel **não** copia essas fórmulas: o card “Lucro Real estimado (RJ)” em `/financeiro` recalcula a partir dos pedidos importados.

## Diff entre duas planilhas

Antes de reimportar, compare abas e volume de mudança:

```bash
python scripts/diff_xlsx.py "C:\Users\...\antiga.xlsx" "C:\Users\...\nova.xlsx"
```

O script lista abas só em um dos arquivos e ranqueia churn (linhas só na antiga / só na nova / Δ nonempty). Foque em `Financeiro MMYY`, `Pedidos`, `Entregues`, `Rastreamento`, `Acompanhamentos` e `notas de intermediação*`.

## Conciliação amostra

Após reimport, confira pedido a pedido (venda, compra, taxa, frete, fluxo, mês) numa amostra autorizada, como em `docs/implementation-guide-progress.md`.
