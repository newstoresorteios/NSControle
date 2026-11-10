import { db } from "@/lib/db";
import { chooseDeliveryAddress, customerCard, trayOrderRef, trayRecipient, type CustomerCard, type Recipient } from "@/lib/integracao";
import { trayConfigured, trayGet } from "@/lib/tray-client";

export type { CustomerCard } from "@/lib/integracao";

export type OrderCustomer = CustomerCard & {
  shipment: string;
  tracking: string;
};

const KEPT = ["name", "address", "number", "complement", "city", "state", "postal_code", "country", "phone", "tax_id", "email", "neighborhood"] as const;

function keepFilled(fresh: Recipient, stored: Partial<Recipient> | null): Recipient {
  if (!stored) return fresh;
  const merged = { ...fresh };
  for (const key of KEPT) {
    if (!fresh[key]?.trim() && stored[key]?.trim()) merged[key] = stored[key].trim();
  }
  return merged;
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function customerNumber(value: string, store: string) {
  const prefixed = /^(\d{6,}):(\d+)$/.exec(value);
  if (prefixed) return !store || prefixed[1] === store ? prefixed[2] : "";
  return /^\d+$/.test(value) ? value : "";
}

async function recipientFromTray(orderKey: string, stored: Partial<Recipient> | null, hint = "") {
  const ref = trayOrderRef(orderKey, hint);
  if (!ref || !trayConfigured()) return { recipient: stored, shipment: "", tracking: "" };
  const query = ref.store ? { store: ref.store } : undefined;
  const payload = await trayGet(`/internal/orders/${ref.id}/complete`, query);
  let fresh = keepFilled(trayRecipient(payload), stored);
  if (!fresh.address.trim()) {
    const customer = payload.customer;
    const rawId = customer && typeof customer === "object" && !Array.isArray(customer)
      ? text((customer as Record<string, unknown>).id)
      : "";
    const customerId = customerNumber(rawId, ref.store) || customerNumber(ref.customerId, ref.store);
    if (customerId) {
      const listed = await trayGet("/internal/customer-addresses", { customer_id: customerId, ...query });
      const extra = chooseDeliveryAddress(listed);
      if (extra?.address) fresh = keepFilled(extra as Recipient, fresh);
    }
  }
  const shipping = payload.shipping && typeof payload.shipping === "object" && !Array.isArray(payload.shipping)
    ? payload.shipping as Record<string, unknown>
    : {};
  return {
    recipient: fresh,
    shipment: text(shipping.shipment),
    tracking: text(shipping.sending_code),
  };
}

export async function ensureOrderCustomer(orderId: string, orderKey: string, hint = ""): Promise<OrderCustomer | null> {
  const sql = db();
  const [stored] = await sql<{ recipient: Partial<Recipient> | null }[]>`
    select recipient from ctl_integration_order_data where order_id = ${orderId}
  `;
  let recipient = stored?.recipient ?? null;
  let shipment = "";
  let tracking = "";
  try {
    const loaded = await recipientFromTray(orderKey, recipient, hint);
    shipment = loaded.shipment;
    tracking = loaded.tracking;
    const fresh = loaded.recipient;
    if (fresh && (fresh.name || fresh.tax_id || fresh.address || fresh.phone || fresh.email)) {
      await sql`
        insert into ctl_integration_order_data (order_id, recipient)
        values (${orderId}, ${sql.json(fresh)})
        on conflict (order_id) do update set recipient = excluded.recipient, updated_at = now()
      `;
      recipient = fresh;
    }
  } catch {
    // A ficha já gravada continua visível se a Tray não responder.
  }
  const card = customerCard(recipient);
  if (!card && !shipment && !tracking) return null;
  return {
    name: card?.name ?? "",
    taxId: card?.taxId ?? "",
    email: card?.email ?? "",
    phone: card?.phone ?? "",
    street: card?.street ?? "",
    neighborhood: card?.neighborhood ?? "",
    city: card?.city ?? "",
    postalCode: card?.postalCode ?? "",
    shipment,
    tracking,
  };
}
