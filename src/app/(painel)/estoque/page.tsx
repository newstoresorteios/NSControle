import Link from "next/link";
import { createInventoryItem, updateInventoryItem } from "@/app/(painel)/estoque/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl } from "@/lib/format";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const items = await db()<
    {
      id: string;
      brand: string | null;
      model: string;
      origin: string | null;
      tracking_code: string | null;
      sale_price: string | null;
      sale_price_note: string | null;
      cost: string | null;
      location: string | null;
      status: string | null;
      notes: string | null;
      purchased_at: string | null;
      order_id: string | null;
    }[]
  >`
    select id, brand, model, origin, tracking_code, sale_price, sale_price_note, cost, location, status, notes, purchased_at, order_id
    from ctl_inventory_items
    order by brand, model
  `;
  const priced = items.map((item) => asNumber(item.sale_price)).filter((value): value is number => value != null);
  const costs = items.map((item) => asNumber(item.cost)).filter((value): value is number => value != null);
  const saleTotal = priced.reduce((sum, value) => sum + value, 0);
  const costTotal = costs.reduce((sum, value) => sum + value, 0);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Estoque</h1>
        <p className="text-muted">
          {items.length} peças · venda {brl(saleTotal)} · custo {brl(costTotal)} · resultado {brl(saleTotal - costTotal)}
        </p>
      </div>
      {params.erro ? <p className="text-sm text-danger">Informe ao menos o modelo.</p> : null}
      {params.ok ? <p className="text-sm text-ok">Item atualizado.</p> : null}
      <details className="card">
        <summary className="section-title">Nova peça</summary>
        <form action={createInventoryItem} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">Marca<input name="brand" /></label>
          <label className="grid gap-1 text-sm">Modelo<input name="model" required /></label>
          <label className="grid gap-1 text-sm">Origem<input name="origin" /></label>
          <label className="grid gap-1 text-sm">Rastreio<input name="tracking_code" /></label>
          <label className="grid gap-1 text-sm">Preço PIX<input name="sale_price" /></label>
          <label className="grid gap-1 text-sm">Custo<input name="cost" /></label>
          <label className="grid gap-1 text-sm">Local<input name="location" defaultValue="Loja" /></label>
          <label className="grid gap-1 text-sm">Status<input name="status" defaultValue="Disponível" /></label>
          <label className="grid gap-1 text-sm">Compra<input name="purchased_at" type="date" /></label>
          <button type="submit" className="md:col-span-3 md:w-fit">Adicionar</button>
        </form>
      </details>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Origem</th>
              <th>Local</th>
              <th>Status</th>
              <th>PIX</th>
              <th>Custo</th>
              <th>Pedido</th>
              <th>Ficha</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.brand || "—"}</td>
                <td>{item.model}</td>
                <td>{item.origin || "—"}</td>
                <td>{item.location || "—"}</td>
                <td>{item.status || "—"}</td>
                <td className="num">{item.sale_price_note || brl(item.sale_price)}</td>
                <td className="num">{brl(item.cost)}</td>
                <td>
                  {item.order_id ? (
                    <Link className="underline" href={`/pedidos/${item.order_id}`}>
                      Abrir
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <details>
                    <summary className="cursor-pointer underline">Editar</summary>
                    <form action={updateInventoryItem} className="mt-3 grid min-w-72 gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <label className="grid gap-1 text-sm">Marca<input name="brand" defaultValue={item.brand ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Modelo<input name="model" defaultValue={item.model} required /></label>
                      <label className="grid gap-1 text-sm">Origem<input name="origin" defaultValue={item.origin ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Rastreio<input name="tracking_code" defaultValue={item.tracking_code ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Preço PIX<input name="sale_price" defaultValue={item.sale_price ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Custo<input name="cost" defaultValue={item.cost ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Local<input name="location" defaultValue={item.location ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Status<input name="status" defaultValue={item.status ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Compra<input name="purchased_at" type="date" defaultValue={item.purchased_at ? String(item.purchased_at).slice(0, 10) : ""} /></label>
                      <label className="grid gap-1 text-sm">Observações<textarea name="notes" defaultValue={item.notes ?? ""} /></label>
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
