import Link from "next/link";
import { markOrderTaxed, saveOrderImportTax, setOrderTaxPaid } from "./actions";
import { db } from "@/lib/db";
import { brl } from "@/lib/format";
import { taxQueueStatus, type TaxQueueStatus } from "@/lib/taxes";

const filters: Array<{ key: string; label: string }> = [
  { key: "", label: "Todas" },
  { key: "sem_valor", label: "Sem valor" },
  { key: "a_pagar", label: "A pagar" },
  { key: "paga", label: "Pagas" },
];

export async function TaxQueue({ status, error, ok }: { status?: string; error?: string; ok?: string }) {
  const orders = await db()<Array<{
    id: string; order_key: string; label: string | null; product_name: string | null;
    tracking_code: string | null; import_tax: string | null; tax_paid: boolean;
    tax_identified_at: string | null;
  }>>`
    select id, order_key, label, product_name, tracking_code, import_tax, tax_paid, tax_identified_at
    from ctl_orders where tax_identified_at is not null
    order by tax_identified_at desc, order_key desc
  `;
  const filtered = orders.filter((order) => !status || taxQueueStatus(order) === status);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="page-title">Fila manual de taxas</h1>
        <p className="text-muted">Confirme a cobrança em um pedido existente. Valor e pagamento são lançamentos separados.</p>
      </div>
      <nav className="flex gap-2">
        <Link className="button secondary" href="/financeiro">Resumo mensal</Link>
        <Link className="button" href="/financeiro?aba=taxas">Taxas</Link>
      </nav>
      {error ? <p className="text-sm text-danger">Não foi possível salvar. Confira o pedido, o valor e se há mais de um pedido com esse identificador.</p> : null}
      {ok ? <p className="text-sm text-ok">Lançamento salvo.</p> : null}
      <form action={markOrderTaxed} className="card flex flex-wrap items-end gap-3">
        <label className="grid min-w-60 gap-1 text-sm">Pedido ou rastreio<input name="lookup" required /></label>
        <button type="submit">Confirmar cobrança</button>
      </form>
      <nav className="flex flex-wrap gap-2">
        {filters.map((filter) => <Link key={filter.key} className="button secondary" href={`/financeiro?aba=taxas${filter.key ? `&status=${filter.key}` : ""}`}>{filter.label}</Link>)}
      </nav>
      <div className="card overflow-x-auto">
        <table>
          <thead><tr><th>Pedido</th><th>Produto</th><th>Rastreio</th><th>Situação</th><th>Valor</th><th>Pagamento</th></tr></thead>
          <tbody>
            {filtered.map((order) => {
              const queueStatus = taxQueueStatus(order) as TaxQueueStatus;
              return <tr key={order.id}>
                <td><Link className="underline" href={`/pedidos/${order.id}`}>{order.label || order.order_key}</Link></td>
                <td>{order.product_name || "—"}</td>
                <td>{order.tracking_code || "—"}</td>
                <td>{queueStatus === "sem_valor" ? "Pendente de valor" : queueStatus === "paga" ? "Paga" : "A pagar"}</td>
                <td>
                  <form action={saveOrderImportTax} className="flex min-w-48 gap-2">
                    <input type="hidden" name="id" value={order.id} />
                    <input aria-label={`Taxa do pedido ${order.order_key}`} name="import_tax" defaultValue={order.import_tax ?? ""} placeholder="Não informado" />
                    <button type="submit">Salvar</button>
                  </form>
                  {order.import_tax != null ? <span className="text-xs text-muted">Atual: {brl(order.import_tax)}</span> : null}
                </td>
                <td>
                  <form action={setOrderTaxPaid}>
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="tax_paid" value={String(!order.tax_paid)} />
                    <button className="secondary" type="submit">{order.tax_paid ? "Marcar não paga" : "Confirmar pagamento"}</button>
                  </form>
                </td>
              </tr>;
            })}
            {filtered.length === 0 ? <tr><td colSpan={6}>Nenhuma cobrança nesta situação.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
