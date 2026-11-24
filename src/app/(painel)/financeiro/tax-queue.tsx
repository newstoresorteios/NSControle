import Link from "next/link";
import { markOrderTaxed, saveOrderImportTax, setOrderTaxPaid } from "./actions";
import { db } from "@/lib/db";
import { brl, monthLabel } from "@/lib/format";
import { taxQueueStatus, type TaxQueueStatus } from "@/lib/taxes";

const filters: Array<{ key: string; label: string }> = [
  { key: "", label: "Todas" },
  { key: "sem_valor", label: "Sem valor" },
  { key: "a_pagar", label: "A pagar" },
  { key: "paga", label: "Pagas" },
];

export async function TaxQueue({ status, error, ok, month }: { status?: string; error?: string; ok?: string; month?: string }) {
  const orders = await db()<Array<{
    id: string; order_key: string; label: string | null; product_name: string | null;
    tracking_code: string | null; import_tax: string | null; tax_paid: boolean;
    tax_identified_at: string | null; finance_month: string | null;
  }>>`
    select id, order_key, label, product_name, tracking_code, import_tax, tax_paid, tax_identified_at, finance_month::text
    from ctl_orders where tax_identified_at is not null
    order by finance_month desc nulls last, tax_identified_at desc, order_key desc
  `;
  const months = [...new Set(orders.map((order) => (order.finance_month ? String(order.finance_month).slice(0, 7) : "")).filter(Boolean))];
  const selected = month === "sem" ? "sem" : month && months.includes(month) ? month : months[0] ?? "sem";
  const inMonth = orders.filter((order) => {
    const key = order.finance_month ? String(order.finance_month).slice(0, 7) : "";
    return selected === "sem" ? !key : key === selected;
  });
  const filtered = inMonth.filter((order) => !status || taxQueueStatus(order) === status);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="page-title">Fila manual de taxas</h1>
        <p className="text-muted">A fila mostra um mês de cada vez. Confirme a cobrança em um pedido desse mês. Valor e pagamento são lançamentos separados.</p>
      </div>
      <nav className="flex flex-wrap gap-2">
        <Link className="button secondary" href={selected === "sem" ? "/financeiro" : `/financeiro?month=${selected}`}>Resumo</Link>
        <Link className="button secondary" href={`/financeiro?month=${selected === "sem" ? "" : selected}&aba=pedidos`}>Pedidos do mês</Link>
        <Link className="button secondary" href={`/financeiro?month=${selected === "sem" ? "" : selected}&aba=pendencias`}>Pendências</Link>
        <Link className="button secondary" href={`/financeiro?month=${selected === "sem" ? "" : selected}&aba=impostos`}>Impostos</Link>
        <Link className="button" href={`/financeiro?aba=taxas&month=${selected}`}>Taxas</Link>
      </nav>
      <nav className="flex flex-wrap gap-2">
        {months.map((item) => (
          <Link key={item} className={item === selected ? "button" : "button secondary"} href={`/financeiro?aba=taxas&month=${item}${status ? `&status=${status}` : ""}`}>
            {monthLabel(item)}
          </Link>
        ))}
        <Link className={selected === "sem" ? "button" : "button secondary"} href={`/financeiro?aba=taxas&month=sem${status ? `&status=${status}` : ""}`}>
          Sem mês
        </Link>
      </nav>
      {error ? <p className="text-sm text-danger">Não foi possível salvar. Confira o pedido, o valor e se há mais de um pedido com esse identificador.</p> : null}
      {ok ? <p className="text-sm text-ok">Lançamento salvo.</p> : null}
      <form action={markOrderTaxed} className="card flex flex-wrap items-end gap-3">
        <label className="grid min-w-60 gap-1 text-sm">Pedido ou rastreio<input name="lookup" required /></label>
        <button className="ok" type="submit">Confirmar cobrança</button>
      </form>
      <nav className="flex flex-wrap gap-2">
        {filters.map((filter) => <Link key={filter.key} className={(!status && !filter.key) || status === filter.key ? "button" : "button secondary"} href={`/financeiro?aba=taxas&month=${selected}${filter.key ? `&status=${filter.key}` : ""}`}>{filter.label}</Link>)}
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
                    <button className="ok" type="submit">Salvar</button>
                  </form>
                  {order.import_tax != null ? <span className="text-xs text-muted">Atual: {brl(order.import_tax)}</span> : null}
                </td>
                <td>
                  <form action={setOrderTaxPaid}>
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="tax_paid" value={String(!order.tax_paid)} />
                    <button className={order.tax_paid ? "no" : "ok"} type="submit">{order.tax_paid ? "Marcar não paga" : "Confirmar pagamento"}</button>
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
