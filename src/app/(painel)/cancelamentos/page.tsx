import Link from "next/link";
import { createCancellation, updateCancellation } from "@/app/(painel)/cancelamentos/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl, monthLabel, shortDate } from "@/lib/format";
import { CANCELLATION_STATUSES, REFUND_METHODS, withCurrent } from "@/lib/lists";

export default async function CancelamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; month?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const sql = db();
  const monthRows = await sql<{ month: string }[]>`
    select distinct to_char(
      date_trunc(
        'month',
        coalesce(o.finance_month, c.due_date, (c.created_at at time zone 'America/Sao_Paulo')::date)
      ),
      'YYYY-MM'
    ) as month
    from ctl_cancellations c
    left join ctl_orders o on o.id = c.order_id
    order by month desc
  `;
  const months = monthRows.map((row) => row.month).filter((month) => /^\d{4}-\d{2}$/.test(month));
  const selected = params.month && months.includes(params.month) ? params.month : months[0];
  if (!selected) {
    return (
      <div className="grid gap-4">
        <h1 className="page-title">Cancelamentos</h1>
        <p className="text-muted">Nenhum cancelamento registrado.</p>
      </div>
    );
  }
  const data = await sql`
    select c.id, c.order_id, c.order_key, c.model, c.amount, c.due_date, c.done_date, c.status, c.gateway, c.refund_method, c.bank_details, c.reason
    from ctl_cancellations c
    left join ctl_orders o on o.id = c.order_id
    where to_char(
      date_trunc(
        'month',
        coalesce(o.finance_month, c.due_date, (c.created_at at time zone 'America/Sao_Paulo')::date)
      ),
      'YYYY-MM'
    ) = ${selected}
    order by c.due_date desc nulls last, c.order_key desc
  `;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = [...(data ?? [])].sort((left, right) => {
    const pending = Number(Boolean(left.done_date)) - Number(Boolean(right.done_date));
    if (pending) return pending;
    return String(left.due_date || "9999-99-99").localeCompare(String(right.due_date || "9999-99-99"));
  });
  const valued = rows.filter((item) => asNumber(item.amount) != null);
  const returned = rows.filter((item) => item.done_date);
  const pendingRows = rows.filter((item) => !item.done_date);
  const returnedTotal = returned.reduce((sum, item) => sum + (asNumber(item.amount) ?? 0), 0);
  const pendingTotal = pendingRows.reduce((sum, item) => sum + (asNumber(item.amount) ?? 0), 0);
  const missingAmount = rows.length - valued.length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Cancelamentos de {monthLabel(selected)}</h1>
          <p className="max-w-3xl text-sm text-muted">
            O mês é o da venda na ficha. {rows.length} {rows.length === 1 ? "cancelamento" : "cancelamentos"} neste mês. Devolvido {brl(returnedTotal)}. Falta devolver {brl(pendingTotal)}.{missingAmount ? ` ${missingAmount} sem valor registrado.` : ""}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {months.map((month) => (
            <Link key={month} className={month === selected ? "button" : "button secondary"} href={`/cancelamentos?month=${month}`}>
              {monthLabel(month)}
            </Link>
          ))}
        </nav>
      </div>
      {params.erro ? <p className="text-sm text-danger">Não foi possível registrar o cancelamento.</p> : null}
      {params.ok ? <p className="text-sm text-ok">Cancelamento atualizado.</p> : null}
      <details className="card">
        <summary className="section-title">Novo cancelamento</summary>
        <form action={createCancellation} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="month" value={selected} />
          <label className="grid gap-1 text-sm">Pedido<input name="order_key" /></label>
          <label className="grid gap-1 text-sm">Modelo<input name="model" /></label>
          <label className="grid gap-1 text-sm">Valor<input name="amount" /></label>
          <label className="grid gap-1 text-sm">Meio<input name="gateway" placeholder="vindi" /></label>
          <Choice label="Modo do estorno" name="refund_method" value="" options={REFUND_METHODS} />
          <Choice label="Status" name="status" value="Cancelado" options={CANCELLATION_STATUSES} />
          <label className="grid gap-1 text-sm">Devolver até<input name="due_date" type="date" /></label>
          <label className="grid gap-1 text-sm">Devolvido em<input name="done_date" type="date" /></label>
          <label className="grid gap-1 text-sm md:col-span-3">Dados bancários<input name="bank_details" /></label>
          <label className="grid gap-1 text-sm md:col-span-3">Motivo<input name="reason" /></label>
          <button type="submit" className="md:w-fit">Registrar</button>
        </form>
      </details>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Modelo</th>
              <th>Valor</th>
              <th>Devolver até</th>
              <th>Devolvido em</th>
              <th>Status</th>
              <th>Meio</th>
              <th>Banco</th>
              <th>Ficha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.order_id ? (
                    <Link className="underline" href={`/pedidos/${item.order_id}`}>
                      {item.order_key}
                    </Link>
                  ) : (
                    item.order_key || "—"
                  )}
                </td>
                <td>{item.model || "—"}</td>
                <td className="num">{brl(item.amount)}</td>
                <td className={!item.done_date && item.due_date && String(item.due_date).slice(0, 10) < today ? "text-danger font-medium" : undefined}>{shortDate(item.due_date)}</td>
                <td>{item.done_date ? shortDate(item.done_date) : "—"}</td>
                <td><span className={`tag ${item.done_date ? "tag-ok" : "tag-warn"}`}>{item.status || (item.done_date ? "Devolvido" : "Pendente")}</span></td>
                <td>{item.gateway || item.refund_method || "—"}</td>
                <td>{item.bank_details || "—"}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer underline">Editar</summary>
                    <form action={updateCancellation} className="mt-3 grid min-w-72 gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="month" value={selected} />
                      <label className="grid gap-1 text-sm">Modelo<input name="model" defaultValue={item.model ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Valor<input name="amount" defaultValue={item.amount ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Meio<input name="gateway" defaultValue={item.gateway ?? ""} /></label>
                      <Choice label="Modo do estorno" name="refund_method" value={item.refund_method || item.gateway} options={REFUND_METHODS} />
                      <Choice label="Status" name="status" value={item.status} options={CANCELLATION_STATUSES} />
                      <label className="grid gap-1 text-sm">Devolver até<input name="due_date" type="date" defaultValue={item.due_date ? String(item.due_date).slice(0, 10) : ""} /></label>
                      <label className="grid gap-1 text-sm">Devolvido em<input name="done_date" type="date" defaultValue={item.done_date ? String(item.done_date).slice(0, 10) : ""} /></label>
                      <label className="grid gap-1 text-sm">Dados bancários<input name="bank_details" defaultValue={item.bank_details ?? ""} /></label>
                      <label className="grid gap-1 text-sm">Motivo<input name="reason" defaultValue={item.reason ?? ""} /></label>
                      <button className="ok" type="submit">Salvar</button>
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

function Choice({ label, name, value, options }: { label: string; name: string; value: string | null; options: readonly string[] }) {
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
