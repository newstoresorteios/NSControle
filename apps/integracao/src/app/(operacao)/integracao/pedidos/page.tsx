import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { CUSTOMS_TEMPLATES, eligibleOrder, type Recipient } from "@/lib/integracao";
import { Field, Notice, recipientFields } from "../ui";
import { associateOrder } from "./actions";

export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ pedido?: string; ok?: string; erro?: string }> }) {
  const actor = await requireOperator();
  const params = await searchParams;
  const sql = db();
  const newstore = actor.role === "newstore";
  const selected = /^[0-9a-f-]{36}$/i.test(params.pedido || "") ? params.pedido! : "";
  const [units, linked, waiting] = await Promise.all([
    newstore
      ? sql`select u.id, u.serial_number, i.model, i.location from ctl_integration_units u join ctl_integration_stock i on i.id = u.inventory_id where i.status = 'Disponível' and i.order_id is null order by u.id`
      : Promise.resolve([]),
    sql`select o.id, o.order_key, o.product_name, s.unit_id, s.status, u.serial_number
      from ctl_integration_shipments s
      join ctl_orders o on o.id = s.order_id
      join ctl_integration_units u on u.id = s.unit_id
      where s.status <> 'cancelado'
      order by s.created_at desc
      limit 80`,
    newstore
      ? sql`select o.id, o.order_key, o.product_name, o.commercial_status, o.delivered, o.tracking_code, d.recipient
        from ctl_orders o
        left join ctl_integration_order_data d on d.order_id = o.id
        where o.delivered = false
          and (o.tracking_code is null or btrim(o.tracking_code) = '')
          and upper(btrim(coalesce(o.commercial_status, ''))) in ('A ENVIAR', 'A ENVIAR VINDI')
          and not exists (select 1 from ctl_integration_shipments s where s.order_id = o.id and s.status <> 'cancelado')
        order by o.order_key desc
        limit 40`
      : Promise.resolve([]),
  ]);
  const order = waiting.find((item) => item.id === selected) || null;
  const eligible = order ? eligibleOrder(order as { delivered: boolean; commercial_status: string | null; tracking_code: string | null }) : false;
  const recipient = ((order?.recipient || {}) as Partial<Recipient>);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="page-title">Pedidos</h1>
        <p className="text-muted">A New Store escolhe a unidade pelo ID e associa à venda. O destinatário vem do pedido e a declaração sai de um modelo, com complemento quando precisar. O pedido associado aparece na expedição como pendente de preparação.</p>
      </header>
      <Notice ok={params.ok} erro={params.erro} />
      {newstore ? (
        <section className="card grid gap-4">
          <h2 className="section-title">Associar unidade</h2>
          {!waiting.length ? <p className="text-muted">Nenhum pedido a enviar sem unidade reservada.</p> : (
            <div className="sheet">
              <table>
                <thead><tr><th>Pedido</th><th>Produto</th><th></th></tr></thead>
                <tbody>
                  {waiting.map((item) => (
                    <tr key={item.id}>
                      <td>#{item.order_key}</td>
                      <td>{item.product_name || "—"}</td>
                      <td>{item.id === selected ? <span className="tag tag-info">Selecionado</span> : <Link href={`/integracao/pedidos?pedido=${item.id}`}>Associar</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {order && eligible ? (
            <form action={associateOrder} className="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="order_id" value={order.id} />
              <input type="hidden" name="email" value={recipient.email || ""} />
              <input type="hidden" name="neighborhood" value={recipient.neighborhood || ""} />
              <p className="md:col-span-3 text-sm">Pedido #{order.order_key} · {order.product_name || "sem produto"}</p>
              <label className="md:col-span-3">Unidade disponível
                <select name="unit_id" required defaultValue="">
                  <option value="">Selecione o ID</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>#{unit.id} · {unit.model} · série {unit.serial_number} · {unit.location}</option>)}
                </select>
              </label>
              {recipientFields.map(([name, label]) => (
                <Field key={name} name={name} label={label} value={recipient[name as keyof Recipient] || (name === "country" ? "BR" : "")} required={name !== "complement"} />
              ))}
              <label className="md:col-span-3">Modelo da declaração
                <select name="template" required defaultValue="pulso">
                  {CUSTOMS_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.description} · HS {item.hs} · {item.origin} · {item.currency}</option>)}
                </select>
              </label>
              <Field name="complement" label="Complemento da declaração" />
              <Field name="declared_value" label="Valor declarado" type="number" required />
              <label className="md:col-span-3"><input name="confirmed" type="checkbox" required /> Conferi pagamento, modelo, unidade, endereço e declaração.</label>
              <button className="w-fit" disabled={!units.length}>Associar e enviar para preparação</button>
              {!units.length ? <p className="text-sm text-muted">Nenhuma unidade disponível no recebimento.</p> : null}
            </form>
          ) : null}
        </section>
      ) : (
        <p className="card text-muted">A New Store associa a unidade à venda. Quando o pedido fica pendente, ele entra na expedição.</p>
      )}
      <section className="grid gap-3">
        <h2 className="section-title">Pedidos associados</h2>
        {!linked.length ? <div className="card text-muted">Nenhum pedido associado a uma unidade.</div> : (
          <div className="sheet">
            <table>
              <thead><tr><th>Pedido</th><th>Unidade</th><th>Série</th><th>Produto</th><th>Situação</th></tr></thead>
              <tbody>
                {linked.map((item) => (
                  <tr key={`${item.id}-${item.unit_id}`}>
                    <td>#{item.order_key}</td>
                    <td>#{item.unit_id}</td>
                    <td>{item.serial_number}</td>
                    <td>{item.product_name || "—"}</td>
                    <td>{item.status === "pendente" ? "pendente de preparação" : item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
