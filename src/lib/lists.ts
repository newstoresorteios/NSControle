export const COMMERCIAL_STATUSES = [
  "AGUARDANDO PAGAMENTO",
  "AGUARDANDO CONFIRMAÇÃO DO PAGAMENTO",
  "AGUARDANDO VINDI",
  "PENDENTE",
  "A ENVIAR VINDI",
  "A ENVIAR",
  "ENVIADO",
  "FINALIZADO",
  "ENTREGUE",
  "CANCELADO",
] as const;

export const OPEN_COMMERCIAL_STATUSES = COMMERCIAL_STATUSES.filter(
  (status) => status !== "FINALIZADO" && status !== "ENTREGUE" && status !== "CANCELADO",
);

export const SOURCING_STATUSES = [
  "COMPRADO",
  "TAXADO",
  "VENDIDO",
  "RECOMPRADO",
  "INDISPONÍVEL",
  "Ainda não pagou a diferença",
  "Verificando",
  "COMPRADO PARCIALMENTE",
  "PREJUÍZO",
  "ENVIADO",
  "FELIPE VAI COMPRAR",
  "ESPERANDO COMPENSAR",
] as const;

export const ORIGINS = [
  "Europa",
  "Uscloser",
  "Japão",
  "Portugal",
  "AliExpress",
  "Brasil",
  "Particular",
  "Tag",
  "Global Alvaro",
  "Europa Alvaro",
  "China - Diego",
  "Fast Box",
  "Gobox",
  "VRF Grupo Felipe",
  "Devolução",
  "Não sei onde foi comprado",
] as const;

export const INVENTORY_BRANDS = [
  "Bulova",
  "Beaubleu",
  "Baltic",
  "Casio",
  "Certina",
  "Citizen",
  "Chris. Ward",
  "Frederique",
  "Hamilton",
  "Longines",
  "Luminox",
  "Mido",
  "Orient",
  "Oris",
  "Seiko",
  "Tissot",
  "Traska",
  "Venezianico",
  "Victorinox",
] as const;

export const INVENTORY_ORIGINS = [
  "Europa",
  "Japão",
  "Portugal",
  "Estados Unidos",
  "Brasil",
  "Loja",
  "Uscloser",
  "Particular",
  "Devolução",
  "Europa Alvaro",
  "AliExpress",
  "Fast Box",
  "Não sei onde foi comprado",
] as const;

function foldOption(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function canonicalOption(options: readonly string[], value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const key = foldOption(raw);
  return options.find((option) => foldOption(option) === key) ?? raw;
}

export const INVENTORY_LOCATIONS = [
  "Marketing",
  "Loja",
  "Chegando ainda",
  "Vai voltar pro país de origem",
  "Não enviado",
  "Tá na casa do pai do Felipe",
] as const;

export const INVENTORY_STATUSES = ["Disponível", "Em negociação", "Vendido", "Comprado", "Taxa Paga"] as const;

export const CANCELLATION_STATUSES = ["Cancelado", "Aguardando"] as const;

export const REFUND_METHODS = ["Vindi", "Pix - Vindi", "Cartão", "Pix", "Fora", "Transferência"] as const;

export const ADDRESS_USES = [
  "Sim",
  "Não",
  "Sim Usado",
  "Não Usado",
  "NÃO USAR",
  "VERIFICAR SE JÁ NÃO ESTÁ USANDO O NOME EM OUTRO ENDEREÇO",
] as const;

export function withCurrent(options: readonly string[], current: string | null | undefined) {
  const value = (current || "").trim();
  if (value && !options.includes(value)) return [value, ...options];
  return [...options];
}

export function shipmentLabel(orderKey: string, label: string | null) {
  if (orderKey.startsWith("label:")) {
    const pretty = orderKey.slice(6).replace(/-/g, " ");
    return label && label !== orderKey ? label : pretty;
  }
  const match = /^(\d{1,6}):([a-z0-9].*)$/i.exec(orderKey);
  if (match) return `${match[1]} (${match[2]})`;
  if (/^\d+$/.test(orderKey)) return orderKey;
  return label || orderKey;
}
