import Link from "next/link";
import { createTradeIn, updateTradeIn } from "@/app/(painel)/compras/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { brl } from "@/lib/format";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const data = await db()`
    select id, client_name, phone, cpf, address, code, model, condition, cost, invoice_received, delivered, order_id, inventory_item_id
    from ctl_trade_ins
    order by client_name
  `;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Compras de clientes</h1>
        <p className="text-muted">{data?.length ?? 0} relógios comprados de clientes.</p>
      </div>
      {params.erro ? <p className="text-sm text-danger">Informe o nome do cliente.</p> : null}
      {params.ok ? <p className="text-sm text-ok">Compra atualizada.</p> : null}
      <details className="card">
        <summary className="section-title">Nova compra</summary>
        <form action={createTradeIn} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">Cliente<input name="client_name" required /></label>
          <label className="grid gap-1 text-sm">Telefone<input name="phone" /></label>
          <label className="grid gap-1 text-sm">CPF<input name="cpf" /></label>
          <label className="grid gap-1 text-sm">Código<input name="code" /></label>
          <label className="grid gap-1 text-sm">Modelo<input name="model" /></label>
          <label className="grid gap-1 text-sm">Condição<input name="condition" placeholder="NOVO ou USADO" /></label>
          <label className="grid gap-1 text-sm md:col-span-2">Endereço<input name="address" /></label>
          <label className="grid gap-1 text-sm">Custo<input name="cost" /></label>
          <label className="flex items-center gap-2 text-sm"><input className="w-auto" type="checkbox" name="invoice_received" /> Nota de entrada</label>
          <label className="flex items-center gap-2 text-sm"><input className="w-auto" type="checkbox" name="delivered" /> Entregue</label>
          <button type="submit" className="md:w-fit">Registrar</button>
        </form>
      </details>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Modelo</th>
              <th>Condição</th>
              <th>Custo</th>
              <th>Nota</th>
              <th>Entregue</th>
              <th>Pedido</th>
              <th>Ficha</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((item) => (
              <tr key={item.id}>
                <td>
                  {item.client_name}
                  <div className="text-xs text-muted">{item.phone}</div>
                </td>
                <td>{item.model || "—"}</td>
                <td>{item.condition || "—"}</td>
                <td className="num">{brl(item.cost)}</td>
                <td>{item.invoice_received ? "Sim" : "Não"}</td>
                <td>{item.delivered ? "Sim" : "Não"}</td>
                <td>
                  {item.order_id ? (
                    <Link className="underline" href={`/pedidos/${item.order_id}`}>
                      {item.code || "Abrir"}
                    </Link>
                  ) : (
                    item.code || "—"
                  )}
                </td>
                <td>
                  <details>
                    <summary className="cursor-pointer underline">Ver e editar</summary>
                    <form action={updateTradeIn} className="mt-3 grid min-w-72 gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <label className="grid gap-1 text-sm">Cliente<input name="client_name" defaultValue={item.client_name} required /></label>
                      <label className="grid gap-1 text-sm">Telefone<input name="phone" defaultValue={item.phone ?? ""} /></label>
                      <label className="grid gap-1 text-sm">CPF<input name="cpf" defaultValue={item.cpf ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Endereço<input name="address" defaultValue={item.address ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Código<input name="code" defaultValue={item.code ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Modelo<input name="model" defaultValue={item.model ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Condição<input name="condition" defaultValue={item.condition ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Custo<input name="cost" defaultValue={item.cost ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Nota de entrada<select name="invoice_received" defaultValue={String(item.invoice_received)}><option value="false">Não</option><option value="true">Sim</option></select></label>
                      <label className="grid gap-1 text-sm">Entregue<select name="delivered" defaultValue={String(item.delivered)}><option value="false">Não</option><option value="true">Sim</option></select></label>
                      <p className="text-xs text-muted">Alterar o código atualiza o vínculo com o pedido quando houver correspondência única. O vínculo com estoque permanece.</p>
                      <button type="submit">Salvar</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
