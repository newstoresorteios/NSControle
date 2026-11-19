function fold(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const NATIONAL = new Set(["brasil", "pronta entrega"]);
const LOCAL = new Set(["devolucao", "particular", "tag"]);

export function nationalShipment(order: {
  origin?: string | null;
  label?: string | null;
  notes_internal?: string | null;
}) {
  if (NATIONAL.has(fold(order.origin))) return true;
  const text = `${fold(order.label)} ${fold(order.notes_internal)}`;
  return text.includes("pronta entrega");
}

export function needsAna(order: {
  ana_requested?: boolean;
  purchased?: boolean;
  delivered?: boolean;
  origin?: string | null;
  label?: string | null;
  notes_internal?: string | null;
  commercial_status?: string | null;
}) {
  if (order.ana_requested || order.purchased || order.delivered) return false;
  if (nationalShipment(order)) return false;
  if (LOCAL.has(fold(order.origin))) return false;
  if ((order.commercial_status || "").toUpperCase().includes("CANCEL")) return false;
  return true;
}
