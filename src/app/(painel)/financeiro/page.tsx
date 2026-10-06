import Link from "next/link";
import { saveGoal } from "@/app/(painel)/financeiro/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthSummary } from "@/lib/finance";
import { FLOW_LABEL, asNumber, brl, monthLabel, percent } from "@/lib/format";

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; erro?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const sql = db();
  const [goals, monthRows] = await Promise.all([
    sql<{ month: string; target_amount: string }[]>`
      select month, target_amount from ctl_monthly_goals order by month desc
    `,
    sql<{ finance_month: string }[]>`
      select finance_month from ctl_orders
      where finance_month is not null
      order by finance_month desc
      limit 1000
    `,
  ]);
  const months = [
    ...new Set(
      [
        ...goals.map((goal) => String(goal.month).slice(0, 7)),
        ...monthRows.map((row) => String(row.finance_month).slice(0, 7)),
      ].filter((month) => /^\d{4}-\d{2}$/.test(month)),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const selected = params.month && months.includes(params.month) ? params.month : months[0];
  if (!selected) {
    return <p>Nenhum mês financeiro importado.</p>;
  }
  const monthDate = `${selected}-01`;
  const goal = goals.find((item) => String(item.month).slice(0, 7) === selected);
  const orders = await sql<
    {
      id: string;
      label: string | null;
      order_key: string;
      flow: string;
      reference: string | null;
      product_name: string | null;
      sourcing_status: string | null;
      sale_amount: string | null;
      purchase_amount: string | null;
      payment_fee: string | null;
      shipping_cost: string | null;
      import_tax: string | null;
      gain_amount: string | null;
    }[]
  >`
    select id, label, order_key, flow, reference, product_name, sourcing_status,
      sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax, gain_amount
    from ctl_orders
    where finance_month = ${monthDate}
    order by flow, order_key desc
  `;
  const summary = monthSummary(orders ?? [], asNumber(goal?.target_amount), selected);
  const cards = [
    ["Sob encomenda", summary.vendasEncomenda],
    ["Loja nova", summary.vendasLoja],
    ["NS Créditos", summary.vendasCreditos],
    ["Custo de compra", summary.custoCompra],
    ["Taxas e envios", summary.taxas],
    ["Resultado", summary.resultado],
  ] as const;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{monthLabel(selected)}</h1>
          <p className="text-[#6d645b]">
            Margem {percent(summary.margem)} · markup {summary.markup == null ? "—" : summary.markup.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <form className="flex items-center gap-2" action="/financeiro">
          <select name="month" defaultValue={selected}>
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
          <button type="submit">Ver mês</button>
        </form>
      </div>
      {params.erro ? <p className="text-sm text-[#8f3d2b]">Não foi possível salvar a meta.</p> : null}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <article key={label} className="card">
            <p className="text-sm text-[#6d645b]">{label}</p>
            <p className="num mt-1 text-2xl font-semibold">{brl(value)}</p>
          </article>
        ))}
      </section>
      <section className="card grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="grid gap-1 text-sm">
          <p>Meta: {brl(goal?.target_amount)}</p>
          <p>Falta para a meta: {brl(summary.falta)}</p>
          <p>Percentual concluído: {percent(summary.percentual)}</p>
          <p>
            Média diária realizada ({summary.elapsed} dias): {brl(summary.mediaRealizada)}
          </p>
          <p>Média diária a realizar: {brl(summary.mediaARealizar)}</p>
        </div>
        <form action={saveGoal} className="grid gap-2">
          <input type="hidden" name="month" value={selected} />
          <label className="grid gap-1 text-sm">
            Meta do mês
            <input name="target_amount" defaultValue={goal?.target_amount ?? ""} required />
          </label>
          <button type="submit">Atualizar meta</button>
        </form>
      </section>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Fluxo</th>
              <th>Referência</th>
              <th>Compra</th>
              <th>Venda</th>
              <th>Custo</th>
              <th>Taxa</th>
              <th>Ganho</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/pedidos/${order.id}`} className="underline">
                    {order.label || order.order_key}
                  </Link>
                </td>
                <td>{FLOW_LABEL[order.flow] || order.flow}</td>
                <td>{order.reference || order.product_name || "—"}</td>
                <td>{order.sourcing_status || "—"}</td>
                <td className="num">{brl(order.sale_amount)}</td>
                <td className="num">{brl(order.purchase_amount)}</td>
                <td className="num">{brl(order.import_tax)}</td>
                <td className="num">{brl(order.gain_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
