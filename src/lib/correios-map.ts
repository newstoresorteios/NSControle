export type CorreiosEvent = {
  codigo?: string;
  tipo?: string;
  dtHrCriado?: string;
  descricao?: string;
  detalhe?: string;
};

export type CorreiosStatus = {
  tracking_correios: string;
  tracking_situation: string;
  tracking_event_at: string | null;
  delivered: boolean;
};

const STALE_MS = 15 * 24 * 60 * 60 * 1000;

function text(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function eventTime(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const stamped = /[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}-03:00`;
  const parsed = new Date(stamped);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function latestEvent(events: CorreiosEvent[]): CorreiosEvent | null {
  const dated = events.filter((event) => text(event.descricao));
  if (!dated.length) return null;
  return dated.reduce((best, event) => ((event.dtHrCriado || "") > (best.dtHrCriado || "") ? event : best));
}

export function statusFromEvent(event: CorreiosEvent, now = new Date()): CorreiosStatus | null {
  const description = text(event.descricao);
  if (!description) return null;
  const detail = text(event.detalhe);
  const phrase = fold(`${description} ${detail || ""}`);
  const extra = detail && fold(detail) !== fold(description) ? detail : null;
  const when = eventTime(event.dtHrCriado);
  const age = when ? now.getTime() - new Date(when).getTime() : 0;
  const delivered = /\bentregue\b/.test(phrase) && !/nao entregue|tentativa/.test(phrase);
  let tracking_situation = "Em trânsito";
  if (delivered) tracking_situation = "Entregue";
  else if (/devolv/.test(phrase)) tracking_situation = "DEVOLUÇÃO";
  else if (/fiscal|aduane|alfandeg|tribut|desembara|despacho postal/.test(phrase)) tracking_situation = "Alfândega";
  else if (/avaria|extravi|roub|furt|apreend|sinistr/.test(phrase)) tracking_situation = "PROBLEMA";
  else if (when && age > STALE_MS) tracking_situation = "Sem retorno";
  return {
    tracking_correios: [description, extra].filter(Boolean).join(" · ").slice(0, 500),
    tracking_situation,
    tracking_event_at: when,
    delivered,
  };
}
