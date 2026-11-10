import { db } from "@/lib/db";
import { customerCard, trayRecipient, type CustomerCard, type Recipient } from "@/lib/integracao";
import { trayConfigured, trayGet } from "@/lib/tray-client";

export type { CustomerCard } from "@/lib/integracao";

const KEPT = ["name", "address", "number", "complement", "city", "state", "postal_code", "country", "phone", "tax_id", "email", "neighborhood"] as const;

function keepFilled(fresh: Recipient, stored: Partial<Recipient> | null): Recipient {
  if (!stored) return fresh;
  const merged = { ...fresh };
  for (const key of KEPT) {
    if (!fresh[key]?.trim() && stored[key]?.trim()) merged[key] = stored[key].trim();
  }
  return merged;
}

export async function ensureOrderCustomer(orderId: string, orderKey: string): Promise<CustomerCard | null> {
  const sql = db();
  const [stored] = await sql<{ recipient: Partial<Recipient> | null }[]>`
    select recipient from ctl_integration_order_data where order_id = ${orderId}
  `;
  let recipient = stored?.recipient ?? null;
  if (/^\d+$/.test(orderKey) && trayConfigured()) {
    try {
      const payload = await trayGet(`/internal/orders/${orderKey}/complete`);
      const fresh = keepFilled(trayRecipient(payload), recipient);
      if (fresh.name || fresh.tax_id || fresh.address || fresh.phone || fresh.email) {
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
  }
  return customerCard(recipient);
}
