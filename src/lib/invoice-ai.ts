import { parseAiPayload, type ParsedInvoice } from "@/lib/invoice-parse";

const MAX_TEXT = 20_000;

export async function interpretInvoice(raw: string): Promise<ParsedInvoice | null> {
  const key = process.env.INVOICE_AI_KEY?.trim();
  if (!key) return null;
  const url = process.env.INVOICE_AI_URL?.trim() || "https://api.openai.com/v1/chat/completions";
  const model = process.env.INVOICE_AI_MODEL?.trim() || "gpt-4o-mini";
  const text = raw.replace(/\u0000/g, "").slice(0, MAX_TEXT);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extraia uma fatura de fornecedor para JSON. Responda só com o objeto. " +
              "kind taxa é comissão, taxa ou serviço. Mercadoria e reembolso de compra são produto. " +
              "orderKey só existe quando a linha diz Pedido e um número. reference é o código do produto. " +
              "Valores são números: 1.036,00 vira 1036. Datas são YYYY-MM-DD. Não invente linhas.",
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    return parseAiPayload(payload.choices?.[0]?.message?.content);
  } catch {
    return null;
  }
}
