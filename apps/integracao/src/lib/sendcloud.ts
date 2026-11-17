import type { Recipient } from "@/lib/integracao";

const MISSING = "A conta Sendcloud ainda não está ligada a esta plataforma. Registre o rastreio recebido da transportadora.";

export type LabelInput = {
  shipmentId: string;
  orderKey: string;
  recipient: Partial<Recipient> | null;
  description: string;
  value: number;
  currency: string;
  hsCode: string;
  originCountry: string;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function sendcloudReady() {
  return Boolean(env("SENDCLOUD_PUBLIC_KEY") && env("SENDCLOUD_SECRET_KEY") && env("SENDCLOUD_SENDER_ADDRESS_ID") && env("SENDCLOUD_SHIPPING_OPTION"));
}

export function parcelBody(input: LabelInput, senderAddressId: number, shippingOption: string) {
  const recipient = input.recipient || {};
  const country = (recipient.country || "BR").trim().toUpperCase();
  const state = (recipient.state || "").trim().toUpperCase();
  const kilos = (input.weightG / 1000).toFixed(3);
  const price = input.value.toFixed(2);
  const to: Record<string, string> = {
    name: recipient.name?.trim() || "",
    address_line_1: recipient.address?.trim() || "",
    house_number: recipient.number?.trim() || "",
    postal_code: (recipient.postal_code || "").replace(/\D/g, "") || recipient.postal_code?.trim() || "",
    city: recipient.city?.trim() || "",
    country_code: country,
  };
  if (recipient.complement?.trim()) to.address_line_2 = recipient.complement.trim();
  if (recipient.phone?.trim()) to.phone_number = recipient.phone.trim();
  if (recipient.email?.trim()) to.email = recipient.email.trim();
  if (country === "BR" && /^[A-Z]{2}$/.test(state)) to.state_province_code = `BR-${state}`;
  return {
    from_address: { sender_address_id: senderAddressId },
    to_address: to,
    ship_with: {
      type: "shipping_option_code",
      properties: { shipping_option_code: shippingOption },
    },
    order_number: input.orderKey,
    total_order_price: { currency: input.currency, value: price },
    parcels: [
      {
        weight: { value: kilos, unit: "kg" },
        dimensions: {
          length: input.lengthCm.toFixed(2),
          width: input.widthCm.toFixed(2),
          height: input.heightCm.toFixed(2),
          unit: "cm",
        },
        parcel_items: [
          {
            description: input.description.slice(0, 240),
            quantity: 1,
            weight: { value: kilos, unit: "kg" },
            price: { value: price, currency: input.currency },
            hs_code: input.hsCode,
            origin_country: input.originCountry,
          },
        ],
      },
    ],
  };
}

function recipientReady(value: Partial<Recipient> | null) {
  if (!value) return false;
  return ["name", "address", "number", "city", "postal_code", "country"].every((key) => Boolean(value[key as keyof Recipient]?.trim()));
}

function failure(body: Record<string, unknown>) {
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const detail = errors
    .map((item) => (item && typeof item === "object" ? String((item as { detail?: string }).detail || "") : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 240);
  return detail || "A Sendcloud recusou a etiqueta. Confira peso, dimensões e destinatário.";
}

export async function announceParcel(input: LabelInput): Promise<{ ok: true; tracking: string; pdf: Buffer | null } | { ok: false; error: string }> {
  if (!sendcloudReady()) return { ok: false, error: MISSING };
  if (!recipientReady(input.recipient) || !input.description || !Number.isFinite(input.value) || input.value <= 0) {
    return { ok: false, error: "Destinatário ou declaração incompletos para a etiqueta." };
  }
  const sender = Number(env("SENDCLOUD_SENDER_ADDRESS_ID"));
  const option = env("SENDCLOUD_SHIPPING_OPTION");
  if (!Number.isInteger(sender) || sender <= 0 || !option) return { ok: false, error: MISSING };
  const token = Buffer.from(`${env("SENDCLOUD_PUBLIC_KEY")}:${env("SENDCLOUD_SECRET_KEY")}`).toString("base64");
  let response: Response;
  try {
    response = await fetch("https://panel.sendcloud.sc/api/v3/shipments/announce", {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Sendcloud-Idempotency-Key": input.shipmentId,
      },
      body: JSON.stringify(parcelBody(input, sender, option)),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return { ok: false, error: "A Sendcloud não respondeu. Tente de novo antes de emitir outra etiqueta." };
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const parcels = Array.isArray(body.parcels) ? body.parcels : [];
  const parcel = parcels[0] && typeof parcels[0] === "object" ? parcels[0] as Record<string, unknown> : {};
  const tracking = typeof parcel.tracking_number === "string" ? parcel.tracking_number.trim() : "";
  if (!response.ok || !/^[A-Za-z0-9-]{6,60}$/.test(tracking)) return { ok: false, error: failure(body) };
  const file = typeof parcel.label_file === "string" ? parcel.label_file : "";
  const pdf = file ? Buffer.from(file, "base64") : null;
  return { ok: true, tracking, pdf: pdf && pdf.byteLength > 0 && pdf.byteLength <= 2_000_000 ? pdf : null };
}
