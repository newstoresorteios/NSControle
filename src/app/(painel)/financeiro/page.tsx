import Link from "next/link";
import { saveGoal } from "@/app/(painel)/financeiro/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthSummary } from "@/lib/finance";
import { refundTotal } from "@/lib/refunds";
import { TaxQueue } from "./tax-queue";
import { FLOW_LABEL, asNumber, brl, monthLabel, percent } from "@/lib/format";

function pedidos(count: number) {
  return `${count} ${count === 1 ? "pedido" : "pedidos"}`;
}

type Gap = "compra" | "alfandega" | "envio";

function gapOf(value: string | undefined): Gap | null {
  if (value === "compra" || value === "alfandega" || value === "envio") return value;
  return null;
}

function missingGaps(order: { sale_amount: unknown; purchase_amount: unknown; import_tax: unknown; shipping_cost: unknown }): Gap[] {
  if (asNumber(order.sale_amount) == null) return [];
  const gaps: Gap[] = [];
  if (asNumber(order.purchase_amount) == null) gaps.push("compra");
  if (asNumber(order.import_tax) == null) gaps.push("alfandega");
  if (asNumber(order.shipping_cost) == null) gaps.push("envio");
  return gaps;
}

function gapLabel(gap: Gap) {
  if (gap === "compra") return "compra";
  if (gap === "alfandega") return "alfândega";
  return "envio";
}

function gapHref(month: string, current: Gap | null, gap: Gap) {
  return current === gap ? `/financeiro?month=${month}` : `/financeiro?month=${month}&falta=${gap}`;
}

function plain(value: string | null) {
  if (!value) return "";
  const text = value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function GapCard({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link href={href} className={`card stat block ${active ? "border-ink" : ""}`}>
      <p className="kicker">{label}</p>
      <p className={`num mt-2 text-4xl font-medium tracking-tight ${count ? "text-danger" : ""}`}>{count}</p>
      <p className="mt-1 text-sm text-muted">{count ? "Ver os pedidos" : "Nada em aberto"}</p>
    </Link>
  );
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; erro?: string; falta?: string; aba?: string; status?: string; ok?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  if (params.aba === "taxas") {
    return <TaxQueue status={params.status} error={params.erro} ok={params.ok} />;
  }
  const sql = db();
  const [goals, monthRows, refundMonths] = await Promise.all([
    sql<{ month: string; target_amount: string }[]>`
      select month, target_amount from ctl_monthly_goals order by month desc
    `,
    sql<{ finance_month: string }[]>`
      select finance_month from ctl_orders
      where finance_month is not null
      order by finance_month desc
      limit 1000
    `,
    sql<{ month: string }[]>`
      select distinct date_trunc('month', done_date)::date as month
      from ctl_cancellations where done_date is not null
    `,
  ]);
  const months = [
    ...new Set(
      [
        ...goals.map((goal) => String(goal.month).slice(0, 7)),
        ...monthRows.map((row) => String(row.finance_month).slice(0, 7)),
        ...refundMonths.map((row) => String(row.month).slice(0, 7)),
      ].filter((month) => /^\d{4}-\d{2}$/.test(month)),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const selected = params.month && months.includes(params.month) ? params.month : months[0];
  if (!selected) {
    return <div className="grid gap-4"><p>Nenhum mês financeiro importado.</p><Link className="button w-fit" href="/financeiro?aba=taxas">Abrir fila de taxas</Link></div>;
  }
  const monthDate = `${selected}-01`;
  const goal = goals.find((item) => String(item.month).slice(0, 7) === selected);
  const nextMonthDate = new Date(`${monthDate}T00:00:00Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const monthEnd = nextMonthDate.toISOString().slice(0, 10);
  const [orders, refunds] = await Promise.all([sql<
    {
      id: string;
      label: string | null;
      order_key: string;
      flow: string;
      reference: string | null;
      product_name: string | null;
      sourcing_status: string | null;
      purchased: boolean;
      sale_amount: string | null;
      purchase_amount: string | null;
      payment_fee: string | null;
      shipping_cost: string | null;
      import_tax: string | null;
      tax_identified_at: string | null;
      gain_amount: string | null;
    }[]
  >`
    select id, label, order_key, flow, reference, product_name, sourcing_status, purchased,
      sale_amount, purchase_amount, payment_fee, shipping_cost, import_tax, tax_identified_at, gain_amount
    from ctl_orders
    where finance_month = ${monthDate}
    order by flow, order_key desc
  `, sql<{ done_date: string | null; amount: string | null }[]>`
    select done_date, amount from ctl_cancellations
    where done_date >= ${monthDate} and done_date < ${monthEnd}
  `]);
  const summary = monthSummary(orders ?? [], asNumber(goal?.target_amount), selected);
  const falta = gapOf(params.falta);
  const incomplete = (orders ?? []).filter((order) => {
    const gaps = missingGaps(order);
    if (!gaps.length) return false;
    if (falta === "compra") return gaps.includes("compra");
    if (falta === "alfandega") return gaps.includes("alfandega");
    if (falta === "envio") return gaps.includes("envio");
    return true;
  });
  const refunded = refundTotal(refunds, selected);
  const refundsWithoutAmount = refunds.filter((refund) => refund.amount == null).length;
  const importTaxesWithoutAmount = orders.filter((order) => order.tax_identified_at && order.import_tax == null).length;
  const negativeCosts = orders.filter((order) =>
    [order.purchase_amount, order.payment_fee, order.shipping_cost, order.import_tax].some((value) => {
      const numeric = asNumber(value);
      return numeric != null && numeric < 0;
    }),
  ).length;
  const gaps = [
    summary.semCompra ? `custo de compra em ${pedidos(summary.semCompra)}` : null,
    summary.semTaxa ? `taxa da máquina em ${pedidos(summary.semTaxa)}` : null,
    summary.semEnvio ? `envio em ${pedidos(summary.semEnvio)}` : null,
    summary.semAlfandega ? `taxa de importação em ${pedidos(summary.semAlfandega)}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Controle financeiro de {monthLabel(selected)}</h1>
          <p className="max-w-3xl text-sm text-muted">
            Vendas e mês vêm do BI. Frete, produto e rastreio vêm do TRAYadaptor. Custo de compra, taxa da máquina,
            taxa de importação e o status Comprado ficam na ficha do pedido.
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/financeiro">
          <select name="month" defaultValue={selected} style={{ width: "auto" }}>
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
          <button type="submit">Ver mês</button>
        </form>
      </div>
      {params.erro ? <p className="text-sm text-danger">Não foi possível salvar a meta.</p> : null}

      <nav className="flex gap-2">
        <Link className="button" href={`/financeiro?month=${selected}`}>Resumo mensal</Link>
        <Link className="button secondary" href="/financeiro?aba=taxas">Taxas</Link>
      </nav>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card stat">
          <p className="kicker">Venda</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(summary.vendas)}</p>
          <p className="mt-1 text-sm text-muted">Loja, encomenda e créditos.</p>
        </article>
        <article className="card stat">
          <p className="kicker">Custo</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight text-danger">{brl(summary.custoTotal)}</p>
          <p className="mt-1 text-sm text-muted">Compra, envio, alfândega e taxa da máquina.</p>
        </article>
        <article className="card stat">
          <p className="kicker">Lucro</p>
          <p className={`num mt-2 text-3xl font-medium tracking-tight ${summary.resultado < 0 ? "text-danger" : "text-ok"}`}>
            {brl(summary.resultado)}
          </p>
          <p className="mt-1 text-sm text-muted">Margem {percent(summary.margem)}. Vazio entra como zero.</p>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <GapCard
          href={gapHref(selected, falta, "compra")}
          label="Sem preço de compra"
          count={summary.semCompra}
          active={falta === "compra"}
        />
        <GapCard
          href={gapHref(selected, falta, "alfandega")}
          label="Sem taxa alfandegária"
          count={summary.semAlfandega}
          active={falta === "alfandega"}
        />
        <GapCard
          href={gapHref(selected, falta, "envio")}
          label="Sem custo de envio"
          count={summary.semEnvio}
          active={falta === "envio"}
        />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="section-title">
          {falta === "compra"
            ? "Sem preço de compra"
            : falta === "alfandega"
              ? "Sem taxa alfandegária"
              : falta === "envio"
                ? "Sem custo de envio"
                : "Pedidos com lançamento faltando"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {incomplete.length
            ? `${pedidos(incomplete.length)} com venda e ${falta ? gapLabel(falta) : "pelo menos um desses valores"} em branco.`
            : falta
              ? `Nenhum pedido com venda está sem ${gapLabel(falta)}.`
              : "Nenhum pedido com venda está sem compra, alfândega ou envio."}
        </p>
        {incomplete.length ? (
          <table className="mt-3">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Venda</th>
                <th>Compra</th>
                <th>Alfândega</th>
                <th>Envio</th>
                <th>Falta</th>
              </tr>
            </thead>
            <tbody>
              {incomplete.map((order) => {
                const pending = missingGaps(order);
                return (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/pedidos/${order.id}`} className="underline">
                        {order.label || order.order_key}
                      </Link>
                      <div className="text-xs text-muted">{plain(order.product_name || order.reference)}</div>
                    </td>
                    <td className="num">{brl(order.sale_amount)}</td>
                    <td className={`num ${pending.includes("compra") ? "text-danger" : ""}`}>{brl(order.purchase_amount)}</td>
                    <td className={`num ${pending.includes("alfandega") ? "text-danger" : ""}`}>{brl(order.import_tax)}</td>
                    <td className={`num ${pending.includes("envio") ? "text-danger" : ""}`}>{brl(order.shipping_cost)}</td>
                    <td>{pending.map(gapLabel).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="section-title">Resultado financeiro</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Total de vendas loja nova</th>
              <th>Total de vendas sob encomenda</th>
              <th>Dedução: compra</th>
              <th>Dedução: taxas e envios</th>
              <th>Deduções totais estimadas</th>
              <th>Resultado estimado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">{brl(summary.vendasLoja)}</td>
              <td className="num">{brl(summary.vendasEncomenda)}</td>
              <td className="num text-danger">{brl(-summary.custoCompra)}</td>
              <td className="num text-danger">{brl(-summary.taxas)}</td>
              <td className="num text-danger">{brl(-summary.custoTotal)}</td>
              <td className="num text-ok">{brl(summary.resultado)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted">
          Taxas e envios reúnem taxa da máquina, frete e taxa de importação. Os totais seguem o fluxo gravado
          em cada ficha; a identificação de loja velha ainda depende de confirmação.
          {summary.vendasCreditos ? ` NS Créditos ${brl(summary.vendasCreditos)} entram no resultado e ficam fora da meta.` : ""}
        </p>
        {gaps.length ? (
          <p className="mt-2 text-sm text-danger">
            Falta lançar {gaps.join(", ")}. O resultado está incompleto; valores desconhecidos não são custo zero confirmado.
          </p>
        ) : null}
        {importTaxesWithoutAmount ? <p className="mt-2 text-sm text-danger">Há {pedidos(importTaxesWithoutAmount)} com taxação identificada e valor ainda não informado.</p> : null}
        {negativeCosts ? <p className="mt-2 text-sm text-danger">Há {pedidos(negativeCosts)} com custo negativo registrado. Confira a origem e o sinal antes de validar este resultado.</p> : null}
      </section>

      <section className="card">
        <h2 className="section-title">Reembolsos realizados em {monthLabel(selected)}</h2>
        <p className="mt-2 num text-danger">{brl(refunded)}</p>
        <p className="mt-2 text-sm text-muted">Apurados pela data “Devolvido em”. Exibidos separadamente até definir o regime financeiro; não alteram o resultado estimado acima.</p>
        {refundsWithoutAmount ? <p className="mt-2 text-sm text-danger">Há {pedidos(refundsWithoutAmount)} com devolução datada e valor não informado. O total acima inclui apenas valores conhecidos.</p> : null}
      </section>

      <section className="card grid gap-4 overflow-x-auto lg:grid-cols-[1fr_16rem]">
        <div>
          <h2 className="section-title">Meta</h2>
          <table className="mt-3">
            <thead>
              <tr>
                <th>Total de vendas lojas (nova + encomenda)</th>
                <th>Meta</th>
                <th>Falta para a meta</th>
                <th>Percentual concluído</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{brl(summary.vendasLojas)}</td>
                <td className="num">{brl(goal?.target_amount)}</td>
                <td className="num">{brl(summary.falta)}</td>
                <td className="num">{percent(summary.percentual)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            Média diária realizada ({summary.elapsed} dias): {brl(summary.mediaRealizada)}. Média diária da meta:{" "}
            {brl(summary.mediaARealizar)}.
          </p>
        </div>
        <form action={saveGoal} className="grid content-start gap-2">
          <input type="hidden" name="month" value={selected} />
          <label className="grid gap-1 text-sm">
            Meta do mês
            <input name="target_amount" defaultValue={goal?.target_amount ?? ""} required />
          </label>
          <button type="submit">Atualizar meta</button>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="section-title">Indicadores</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Retorno sobre custo total</th>
              <th>Margem de lucro</th>
              <th>Markup sobre o custo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">{percent(summary.retorno)}</td>
              <td className="num">{percent(summary.margem)}</td>
              <td className="num">{percent(summary.markup)}</td>
            </tr>
          </tbody>
        </table>
        <table className="mt-4">
          <thead>
            <tr>
              <th>Média de preço venda</th>
              <th>Média de preço custo</th>
              <th>Média taxa pgto</th>
              <th>Média envio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">{brl(summary.mediaVenda)}</td>
              <td className="num">{brl(summary.mediaCusto)}</td>
              <td className="num">{brl(summary.mediaTaxa)}</td>
              <td className="num">{brl(summary.mediaEnvio)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted">Cada média usa só as linhas em que o valor foi lançado.</p>
      </section>

      <div className="card overflow-x-auto">
        <h2 className="section-title">Linhas do mês</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Fluxo</th>
              <th>Referência</th>
              <th>Status</th>
              <th>Valor de venda</th>
              <th>Valor de compra</th>
              <th>Taxas de pgto</th>
              <th>Custo envio</th>
              <th>Importação</th>
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
                <td>{order.sourcing_status || (order.purchased ? "Comprado" : "—")}</td>
                <td className="num">{brl(order.sale_amount)}</td>
                <td className="num">{brl(order.purchase_amount)}</td>
                <td className="num">{brl(order.payment_fee)}</td>
                <td className="num">{brl(order.shipping_cost)}</td>
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
