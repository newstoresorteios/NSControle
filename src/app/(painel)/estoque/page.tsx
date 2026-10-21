import Link from "next/link";
import { Fragment } from "react";
import { createInventoryItem, updateInventoryItem } from "@/app/(painel)/estoque/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl } from "@/lib/format";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; editar?: string }>;
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
    where not exists (select 1 from ctl_integration_units eu where eu.inventory_id = ctl_inventory_items.id)
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
      {params.erro ? <p className="text-sm text-danger">Não foi possível salvar. Confira o modelo, os valores e a data.</p> : null}
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
      <div id="lista-estoque" className="card scroll-mt-28 overflow-x-auto">
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
              <Fragment key={item.id}>
                <tr>
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
                    <Link className="underline" href={`/estoque?editar=${item.id}#editar-${item.id}`}>Editar</Link>
                  </td>
                </tr>
                {params.editar === item.id ? (
                  <tr>
                    <td colSpan={9} className="bg-paper px-4 py-6">
                      <section id={`editar-${item.id}`} className="mx-auto w-full max-w-4xl scroll-mt-28 rounded-lg border border-line bg-white p-5 shadow-sm">
                        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                          <div>
                            <p className="kicker">Estoque</p>
                            <h2 className="section-title mt-1">Editar peça</h2>
                            <p className="mt-1 text-sm text-muted">{item.brand ? `${item.brand} · ` : ""}{item.model}</p>
                          </div>
                          <Link className="button secondary" href="/estoque#lista-estoque">Fechar</Link>
                        </div>
                        <form action={updateInventoryItem} className="grid gap-4 md:grid-cols-2">
                          <input type="hidden" name="id" value={item.id} />
                          <label className="grid gap-1 text-sm">Marca<input name="brand" defaultValue={item.brand ?? ""} /></label>
                          <label className="grid gap-1 text-sm">Modelo<input name="model" defaultValue={item.model} required /></label>
                          <label className="grid gap-1 text-sm">Origem<input name="origin" defaultValue={item.origin ?? ""} /></label>
                          <label className="grid gap-1 text-sm">Rastreio<input name="tracking_code" defaultValue={item.tracking_code ?? ""} /></label>
                          <label className="grid gap-1 text-sm">Preço PIX<input name="sale_price" defaultValue={item.sale_price ?? ""} inputMode="decimal" /></label>
                          <label className="grid gap-1 text-sm">Custo<input name="cost" defaultValue={item.cost ?? ""} inputMode="decimal" /></label>
                          <label className="grid gap-1 text-sm">Local<input name="location" defaultValue={item.location ?? ""} /></label>
                          <label className="grid gap-1 text-sm">Status<input name="status" defaultValue={item.status ?? ""} /></label>
                          <label className="grid gap-1 text-sm">Compra<input name="purchased_at" type="date" defaultValue={item.purchased_at ? String(item.purchased_at).slice(0, 10) : ""} /></label>
                          <label className="grid gap-1 text-sm md:col-span-2">Observações<textarea name="notes" defaultValue={item.notes ?? ""} rows={3} /></label>
                          <div className="flex flex-wrap gap-2 md:col-span-2">
                            <button type="submit">Salvar alterações</button>
                            <Link className="button secondary" href="/estoque#lista-estoque">Cancelar</Link>
                          </div>
                        </form>
                      </section>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
