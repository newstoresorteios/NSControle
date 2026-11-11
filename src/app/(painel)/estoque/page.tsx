import Link from "next/link";
import { Fragment } from "react";
import { createInventoryItem, updateInventoryItem } from "@/app/(painel)/estoque/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl } from "@/lib/format";
import { canonicalOption, INVENTORY_BRANDS, INVENTORY_LOCATIONS, INVENTORY_ORIGINS, INVENTORY_STATUSES, withCurrent } from "@/lib/lists";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; editar?: string; q?: string; marca?: string; origem?: string; status?: string }>;
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
  const query = (params.q || "").trim().toLowerCase();
  const visible = items.filter((item) => {
    if (params.marca && canonicalOption(INVENTORY_BRANDS, item.brand) !== params.marca) return false;
    if (params.origem && canonicalOption(INVENTORY_ORIGINS, item.origin) !== params.origem) return false;
    if (params.status && (item.status || "") !== params.status) return false;
    if (!query) return true;
    return [item.brand, item.model, item.origin, item.tracking_code, item.location, item.notes].join(" ").toLowerCase().includes(query);
  });
  const priced = visible.map((item) => asNumber(item.sale_price)).filter((value): value is number => value != null);
  const costs = visible.map((item) => asNumber(item.cost)).filter((value): value is number => value != null);
  const saleTotal = priced.reduce((sum, value) => sum + value, 0);
  const costTotal = costs.reduce((sum, value) => sum + value, 0);
  const missingCost = visible.filter((item) => asNumber(item.sale_price) != null && asNumber(item.cost) == null).length;
  const brands = [...new Set(visible.map((item) => canonicalOption(INVENTORY_BRANDS, item.brand) || "Sem marca"))];
  const kept = new URLSearchParams();
  for (const key of ["q", "marca", "origem", "status"] as const) if (params[key]) kept.set(key, params[key]);
  const listHref = `/estoque?${kept.toString()}#lista-estoque`;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Estoque</h1>
        <p className="text-muted">
          {visible.length} peças · venda {brl(saleTotal)} · custo {brl(costTotal)}
          {priced.length ? ` · média de venda ${brl(saleTotal / priced.length)}` : ""}
          {costs.length ? ` · média de custo ${brl(costTotal / costs.length)}` : ""}
        </p>
        {missingCost ? <p className="mt-1 text-sm text-warn">Resultado parcial — {missingCost} {missingCost === 1 ? "peça sem custo" : "peças sem custo"}. O custo vazio não entra como zero confirmado.</p> : <p className="mt-1 text-sm text-muted">Resultado {brl(saleTotal - costTotal)}.</p>}
      </div>
      {params.erro ? <p className="text-sm text-danger">Não foi possível salvar. Confira o modelo, os valores e a data.</p> : null}
      {params.ok ? <p className="text-sm text-ok">Item atualizado.</p> : null}
      <details className="card">
        <summary className="section-title">Nova peça</summary>
        <form action={createInventoryItem} className="mt-3 grid gap-3 md:grid-cols-3">
          <SelectField label="Marca" name="brand" value="" options={INVENTORY_BRANDS} />
          <label className="grid gap-1 text-sm">Modelo<input name="model" required /></label>
          <SelectField label="Origem" name="origin" value="" options={INVENTORY_ORIGINS} />
          <label className="grid gap-1 text-sm">Rastreio<input name="tracking_code" /></label>
          <label className="grid gap-1 text-sm">Preço PIX<input name="sale_price" /></label>
          <label className="grid gap-1 text-sm">Custo<input name="cost" /></label>
          <SelectField label="Local" name="location" value="Loja" options={INVENTORY_LOCATIONS} />
          <SelectField label="Status" name="status" value="Disponível" options={INVENTORY_STATUSES} />
          <label className="grid gap-1 text-sm md:col-span-3">Observação<textarea name="notes" rows={2} /></label>
          <label className="grid gap-1 text-sm">Compra<input name="purchased_at" type="date" /></label>
          <button type="submit" className="md:col-span-3 md:w-fit">Adicionar</button>
        </form>
      </details>
      <form className="card flex flex-wrap items-end gap-3" action="/estoque">
        <label className="grid gap-1 text-sm">Busca<input name="q" defaultValue={params.q ?? ""} placeholder="marca, modelo, rastreio" /></label>
        <SelectField label="Marca" name="marca" value={params.marca ?? ""} options={listedOptions(INVENTORY_BRANDS, items.map((item) => item.brand))} />
        <SelectField label="Origem" name="origem" value={params.origem ?? ""} options={listedOptions(INVENTORY_ORIGINS, items.map((item) => item.origin))} />
        <SelectField label="Status" name="status" value={params.status ?? ""} options={INVENTORY_STATUSES} />
        <button type="submit">Filtrar</button>
        {params.q || params.marca || params.origem || params.status ? <Link className="button secondary" href="/estoque">Limpar</Link> : null}
      </form>
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
            {brands.map((brand) => {
              const group = visible.filter((item) => (canonicalOption(INVENTORY_BRANDS, item.brand) || "Sem marca") === brand);
              const groupSale = group.reduce((sum, item) => sum + (asNumber(item.sale_price) ?? 0), 0);
              const groupCost = group.reduce((sum, item) => sum + (asNumber(item.cost) ?? 0), 0);
              return (
              <Fragment key={brand}>
                <tr>
                  <td colSpan={9} className="font-medium">{brand} · {group.length} · venda {brl(groupSale)} · custo {brl(groupCost)}</td>
                </tr>
                {group.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>{canonicalOption(INVENTORY_BRANDS, item.brand) || "—"}</td>
                  <td>{item.model}</td>
                  <td>{canonicalOption(INVENTORY_ORIGINS, item.origin) || "—"}</td>
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
                    <Link className="underline" href={`/estoque?${new URLSearchParams({ ...Object.fromEntries(kept), editar: item.id }).toString()}#editar-${item.id}`}>Editar</Link>
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
                          <Link className="button secondary" href={listHref}>Fechar</Link>
                        </div>
                        <form action={updateInventoryItem} className="grid gap-4 md:grid-cols-2">
                          <input type="hidden" name="id" value={item.id} />
                          <SelectField label="Marca" name="brand" value={canonicalOption(INVENTORY_BRANDS, item.brand)} options={INVENTORY_BRANDS} />
                          <label className="grid gap-1 text-sm">Modelo<input name="model" defaultValue={item.model} required /></label>
                          <SelectField label="Origem" name="origin" value={canonicalOption(INVENTORY_ORIGINS, item.origin)} options={INVENTORY_ORIGINS} />
                          <label className="grid gap-1 text-sm">Rastreio<input name="tracking_code" defaultValue={item.tracking_code ?? ""} /></label>
                          <label className="grid gap-1 text-sm">Preço PIX<input name="sale_price" defaultValue={item.sale_price ?? ""} inputMode="decimal" /></label>
                          <label className="grid gap-1 text-sm">Custo<input name="cost" defaultValue={item.cost ?? ""} inputMode="decimal" /></label>
                          <SelectField label="Local" name="location" value={item.location} options={INVENTORY_LOCATIONS} />
                          <SelectField label="Status" name="status" value={item.status} options={INVENTORY_STATUSES} />
                          <label className="grid gap-1 text-sm">Compra<input name="purchased_at" type="date" defaultValue={item.purchased_at ? String(item.purchased_at).slice(0, 10) : ""} /></label>
                          <label className="grid gap-1 text-sm md:col-span-2">Observações<textarea name="notes" defaultValue={item.notes ?? ""} rows={3} /></label>
                          <div className="flex flex-wrap gap-2 md:col-span-2">
                            <button className="ok" type="submit">Salvar alterações</button>
                            <Link className="button no" href={listHref}>Cancelar</Link>
                          </div>
                        </form>
                      </section>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
                ))}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function listedOptions(base: readonly string[], values: Array<string | null>) {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of [...base, ...values]) {
    const label = canonicalOption(base, value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    options.push(label);
  }
  return options;
}

function SelectField({ label, name, value, options }: { label: string; name: string; value: string | null; options: readonly string[] }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {withCurrent(options, value).map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}
