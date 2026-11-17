"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { decimal, integer, text } from "@/lib/form";
import { customsFromTemplate, eligibleOrder, recipientValid, type Recipient } from "@/lib/integracao";

const uuid = (value: string | null) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

function finish(orderId: string | null, error?: string): never {
  revalidatePath("/integracao", "layout");
  const target = uuid(orderId) ? `/integracao/pedidos?pedido=${orderId}` : "/integracao/pedidos";
  redirect(`${target}${target.includes("?") ? "&" : "?"}${error ? `erro=${encodeURIComponent(error)}` : "ok=1"}`);
}

export async function associateOrder(data: FormData) {
  const actor = await requireOperator();
  const orderId = text(data, "order_id");
  try {
    if (actor.role !== "newstore") throw new Error("Só a New Store associa a unidade à venda.");
    const unitId = integer(data, "unit_id");
    const customs = customsFromTemplate(text(data, "template") || "", text(data, "complement"));
    const value = decimal(data, "declared_value");
    const recipient = Object.fromEntries(
      ["name", "address", "number", "complement", "city", "state", "postal_code", "country", "phone", "tax_id", "email", "neighborhood"].map((key) => [key, text(data, key) || ""]),
    ) as Recipient;
    if (!uuid(orderId) || !unitId || !recipientValid(recipient) || !customs || !value || value <= 0 || data.get("confirmed") !== "on") {
      throw new Error("Confira a unidade, o destinatário, o modelo aduaneiro e o valor declarado.");
    }
    await db().begin(async (sql) => {
      const [order] = await sql`select delivered, commercial_status, tracking_code from ctl_orders where id = ${orderId!} for update`;
      if (!order || !eligibleOrder(order as { delivered: boolean; commercial_status: string | null; tracking_code: string | null })) {
        throw new Error("O pedido precisa estar a enviar, sem rastreio e sem entrega registrada.");
      }
      const [unit] = await sql`select u.id, i.id as inventory_id, i.status, i.order_id from ctl_integration_units u join ctl_integration_stock i on i.id = u.inventory_id where u.id = ${unitId} for update of u, i`;
      if (!unit || unit.status !== "Disponível" || unit.order_id) throw new Error("A unidade já está reservada ou indisponível.");
      const [shipment] = await sql`insert into ctl_integration_shipments (unit_id,order_id,recipient,customs_description,declared_value,currency,hs_code,origin_country,created_by)
        values (${unitId},${orderId!},${sql.json(recipient)},${customs.description},${value},${customs.currency},${customs.hs},${customs.origin},${actor.email}) returning id`;
      await sql`update ctl_integration_stock set status = 'Reservado', order_id = ${orderId!} where id = ${unit.inventory_id}`;
      await sql`insert into ctl_integration_order_data (order_id, recipient) values (${orderId!}, ${sql.json(recipient)})
        on conflict (order_id) do update set recipient = excluded.recipient, updated_at = now()`;
      await sql`insert into ctl_integration_events (unit_id,shipment_id,action,actor) values (${unitId},${shipment.id},'Reservado para expedição',${actor.email})`;
    });
  } catch (error) {
    finish(orderId, error instanceof Error && !("code" in error) ? error.message : "Pedido ou unidade já possui um envio. Atualize a página.");
  }
  finish(orderId);
}
