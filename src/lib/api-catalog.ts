export type ApiField = { name: string; text: string };

export type ApiCall = {
  id: string;
  group: "Consultar" | "Gravar";
  method: "GET" | "POST";
  path: string;
  title: string;
  use: string;
  params: ApiField[];
  body?: string;
  returns: string;
  rule: string;
};

export const API_CALLS: ApiCall[] = [
  {
    id: "ajuda",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=ajuda",
    title: "Índice",
    use: "Primeira chamada. Devolve a lista de recursos e o que cada um consulta ou grava.",
    params: [],
    returns: "recursos de leitura e de gravação.",
    rule: "Use antes de inventar um caminho.",
  },
  {
    id: "pedidos",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=pedidos&mes=2026-11&pedido=27076",
    title: "Pedidos",
    use: "Lê a ficha para comparar com a planilha: venda, compra, taxa de pagamento, frete, alfândega, rastreio, origem e status.",
    params: [
      { name: "mes", text: "AAAA-MM. Sem pedido nem busca, vale o mês corrente." },
      { name: "pedido", text: "Número ou rótulo. Procura em qualquer mês." },
      { name: "q", text: "Trecho do número, produto, rastreio ou rótulo." },
      { name: "limite", text: "Até 200. O padrão é 100." },
    ],
    returns: "mes, total e a lista pedidos.",
    rule: "Cancelado e aguardando pagamento ficam de fora. Aguardando Vindi entra, porque a venda já está lançada.",
  },
  {
    id: "financeiro",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=financeiro&mes=2026-11",
    title: "Financeiro do mês",
    use: "Totais para bater com o cabeçalho da planilha.",
    params: [{ name: "mes", text: "AAAA-MM. Sem o parâmetro, usa o mês corrente." }],
    returns: "loja_nova, loja_antiga, total, compra, frete, alfandega, taxa_pagamento, custo, lucro e a divisão lojas.",
    rule: "Loja nova é a pronta entrega. Loja antiga é a venda do mês inteiro e já inclui a loja nova. O total soma a loja nova de novo. O lucro desconta o custo uma vez sobre a loja antiga.",
  },
  {
    id: "sem-rastreio",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=sem-rastreio",
    title: "Sem rastreio há 15 dias",
    use: "Pedidos com venda, pagos há mais de 15 dias e ainda sem código.",
    params: [],
    returns: "total e pedidos, no máximo 200, os mais antigos primeiro.",
    rule: "A lista é do sistema inteiro, não de um mês.",
  },
  {
    id: "estoque",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=estoque&q=T149&status=Disponível",
    title: "Estoque",
    use: "Peças da aba Estoque, para comparar com a aba Estoque da planilha.",
    params: [
      { name: "q", text: "Marca, modelo, origem, rastreio, local ou observação." },
      { name: "marca", text: "Nome da marca." },
      { name: "status", text: "Disponível, Vendido ou Comprado." },
      { name: "limite", text: "Até 200. O padrão é 100." },
    ],
    returns: "total, venda, custo e itens com marca, modelo, origem, rastreio, venda, custo, local, status e observação.",
    rule: "A planilha guarda sobretudo o disponível. O sistema também guarda o que já foi vendido. Compare marca, modelo, venda e custo.",
  },
  {
    id: "notas",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=notas&mes=2026-11&pedido=27076",
    title: "Notas de intermediação",
    use: "Linhas da aba de notas: compra, alfândega, frete e rastreio ligados ao pedido.",
    params: [
      { name: "mes", text: "AAAA-MM. Sem pedido, lista o mês." },
      { name: "pedido", text: "Número do pedido." },
      { name: "limite", text: "Até 200. O padrão é 100." },
    ],
    returns: "total e notas. O campo alfandega é a taxa da nota, não a taxa do gateway.",
    rule: "Um valor já preenchido na ficha do pedido não é substituído quando a nota é gravada.",
  },
  {
    id: "pagamentos",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=pagamentos&q=invoice",
    title: "Pagamentos a fornecedor",
    use: "Faturas já lançadas: fornecedor, número, data, moeda, total, vencimento e status.",
    params: [
      { name: "q", text: "Fornecedor ou número da fatura." },
      { name: "limite", text: "Até 200. O padrão é 50." },
    ],
    returns: "total e faturas.",
    rule: "O PDF da fatura entra pela tela Pagamentos. Por aqui a consulta lista o que já foi gravado. A taxa de pagamento de um pedido entra no POST de pedido.",
  },
  {
    id: "cancelamentos",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=cancelamentos&q=27076",
    title: "Cancelamentos e reembolsos",
    use: "Devoluções lançadas, com valor, motivo, status e data.",
    params: [
      { name: "q", text: "Número do pedido, modelo ou status." },
      { name: "limite", text: "Até 200. O padrão é 100." },
    ],
    returns: "total e cancelamentos.",
    rule: "Reembolso não altera o resultado do financeiro do mês da venda.",
  },
  {
    id: "compras",
    group: "Consultar",
    method: "GET",
    path: "/api/claude?recurso=compras&q=cliente",
    title: "Compras de clientes",
    use: "Relógios comprados de clientes: nome, código, modelo, custo e se a nota e a entrega já ocorreram.",
    params: [
      { name: "q", text: "Cliente, código ou modelo." },
      { name: "limite", text: "Até 200. O padrão é 100." },
    ],
    returns: "total e compras.",
    rule: "O código, quando é um número de pedido, liga a compra à ficha.",
  },
  {
    id: "gravar-pedido",
    group: "Gravar",
    method: "POST",
    path: "/api/claude",
    title: "Completar um pedido",
    use: "Lança taxa de pagamento, compra, alfândega, frete, rastreio, origem e observação no que ainda está vazio.",
    params: [],
    body: `{
  "recurso": "pedido",
  "pedido": "27076",
  "taxa_pagamento": 18.9,
  "compra": 8010,
  "alfandega": 46.74,
  "frete": 49.14,
  "rastreio": "AB123456789BR",
  "origem": "Europa",
  "observacao": "conferido com a planilha",
  "comprado": true
}`,
    returns: "ok e a ficha gravada.",
    rule: "Campo que já tem valor permanece. Número usa ponto. pedido é o número da loja.",
  },
  {
    id: "gravar-estoque",
    group: "Gravar",
    method: "POST",
    path: "/api/claude",
    title: "Novo item de estoque",
    use: "Cadastra uma peça que está na planilha e ainda não está no sistema.",
    params: [],
    body: `{
  "recurso": "estoque",
  "marca": "Tissot",
  "modelo": "T149.407.11.031.00",
  "origem": "Europa",
  "rastreio": "",
  "venda": 6790,
  "custo": 3874,
  "local": "casa do Felipe",
  "status": "Disponível",
  "observacao": "",
  "comprado_em": "2026-11-01"
}`,
    returns: "ok e o item, com o id.",
    rule: "modelo é obrigatório. status vazio vira Disponível. Não apaga uma peça já cadastrada.",
  },
  {
    id: "gravar-nota",
    group: "Gravar",
    method: "POST",
    path: "/api/claude",
    title: "Nova nota de intermediação",
    use: "Lança uma linha de nota no mês e preenche na ficha do pedido só o que estiver vazio.",
    params: [],
    body: `{
  "recurso": "nota",
  "mes": "2026-11",
  "pedido": "27076",
  "plataforma": "Europa",
  "comprado": true,
  "rastreio": "LX123456789ES",
  "compra": 12636,
  "alfandega": 216.13,
  "frete": 80
}`,
    returns: "ok, o mês e o número da linha.",
    rule: "mes e pedido são obrigatórios. alfandega da nota não é a taxa do gateway.",
  },
];

export const API_SEARCH = [
  "mes usa AAAA-MM. pedido é o número da loja, também no formato 1490060:593.",
  "q procura um trecho, sem diferenciar maiúsculas.",
  "Para bater com a planilha, leia o pedido pelo número e compare venda, compra, frete e alfândega.",
  "A taxa de pagamento do gateway só entra quando a loja informa um valor positivo. Zero não conta como taxa lançada.",
  "Uma gravação não substitui valor que já existe. Para corrigir um número já gravado, use a ficha no painel.",
];
