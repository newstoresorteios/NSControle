export const ACCENTS = "áàâãäéèêëíìîïóòôõöúùûüç";
export const PLAIN = "aaaaaeeeeiiiiooooouuuuc";

export function foldSearch(value: string) {
  let folded = value.toLowerCase();
  for (let index = 0; index < ACCENTS.length; index += 1) {
    folded = folded.replaceAll(ACCENTS[index], PLAIN[index]);
  }
  return folded;
}

export function likePattern(value: string) {
  return `%${foldSearch(value).replace(/[%_\\]/g, "")}%`;
}

export function orderDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function idPresence(value: string | undefined) {
  return value === "com" || value === "sem" ? value : "";
}
