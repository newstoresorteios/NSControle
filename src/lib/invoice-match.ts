export type OrderHit = {
  id: string;
  orderKey: string;
  label: string | null;
  productName: string | null;
  reference: string | null;
  supplierRef: string | null;
  flow: string;
  purchased?: boolean;
  updatedAt?: string | null;
};

export type LineSuggestion = {
  orderIds: string[];
  candidates: OrderHit[];
  note: string;
};

const MAX_CANDIDATES = 12;
const MAX_AUTO = 12;

export function compactCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function searchKey(reference: string): string | null {
  const tokens = reference
    .split(/\s+/)
    .map(compactCode)
    .filter((token) => token.length >= 6 && /\d/.test(token))
    .sort((left, right) => right.length - left.length);
  if (tokens[0]) return tokens[0];
  const full = compactCode(reference);
  return full.length >= 6 ? full : null;
}

export function suggestInvoice(
  lines: Array<{
    kind: string;
    reference: string | null;
    orderKey: string | null;
    quantity: number | null;
  }>,
  orders: OrderHit[],
): LineSuggestion[] {
  const usedByRef = new Map<string, Set<string>>();
  return lines.map((line) => suggestLine(line, orders, usedByRef));
}

function suggestLine(
  line: { kind: string; reference: string | null; orderKey: string | null; quantity: number | null },
  orders: OrderHit[],
  usedByRef: Map<string, Set<string>>,
): LineSuggestion {
  if (line.kind === "taxa") {
    return { orderIds: [], candidates: [], note: "Taxa da fatura, sem vínculo com pedido." };
  }

  const qty = line.quantity != null && line.quantity > 0 ? Math.max(1, Math.round(line.quantity)) : 1;
  const byKey = line.orderKey ? orders.filter((order) => order.orderKey === line.orderKey) : [];
  if (byKey.length === 1) {
    return { orderIds: [byKey[0].id], candidates: byKey, note: "Número do pedido na fatura." };
  }
  if (byKey.length > 1) {
    const ranked = [...byKey].sort(byRelevance);
    const narrowed = line.reference ? ranked.filter((order) => matchesRef(order, line.reference as string)) : [];
    if (narrowed.length === 1) {
      return {
        orderIds: [narrowed[0].id],
        candidates: ranked.slice(0, MAX_CANDIDATES),
        note: "Número do pedido, confirmado pela referência.",
      };
    }
    return {
      orderIds: [],
      candidates: ranked.slice(0, MAX_CANDIDATES),
      note: `${byKey.length} fichas com o número ${line.orderKey}. Escolha a certa.`,
    };
  }

  if (!line.reference) {
    return { orderIds: [], candidates: [], note: "Linha sem número de pedido nem referência." };
  }

  const code = searchKey(line.reference) ?? compactCode(line.reference);
  const used = usedByRef.get(code) ?? new Set<string>();
  const hits = orders
    .filter((order) => matchesRef(order, line.reference as string) && !used.has(order.id))
    .sort(byRelevance);
  if (!hits.length) {
    return { orderIds: [], candidates: [], note: "Nenhum pedido com essa referência." };
  }
  if (hits.length <= qty && hits.length <= MAX_AUTO) {
    for (const hit of hits) used.add(hit.id);
    usedByRef.set(code, used);
    const note =
      hits.length === qty
        ? qty === 1
          ? "Referência encontrada em um pedido."
          : `${hits.length} pedidos com essa referência.`
        : `Encontrei ${hits.length} de ${qty} pedidos com essa referência.`;
    return { orderIds: hits.map((hit) => hit.id), candidates: hits, note };
  }
  return {
    orderIds: [],
    candidates: hits.slice(0, MAX_CANDIDATES),
    note: `${hits.length} pedidos com essa referência e a fatura pede ${qty}. Escolha quais vincular.`,
  };
}

function byRelevance(left: OrderHit, right: OrderHit) {
  const purchase = Number(Boolean(left.purchased)) - Number(Boolean(right.purchased));
  if (purchase) return purchase;
  return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
}

function matchesRef(order: OrderHit, reference: string): boolean {
  const blob = compactCode(
    `${order.reference ?? ""} ${order.productName ?? ""} ${order.supplierRef ?? ""} ${order.label ?? ""}`,
  );
  const full = compactCode(reference);
  if (full.length >= 6 && blob.includes(full)) return true;
  const key = searchKey(reference);
  return Boolean(key && key.length >= 6 && blob.includes(key));
}
