import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl, monthLabel } from "@/lib/format";

type NoteRow = {
  id: string;
  line_no: number;
  order_key: string;
  label: string | null;
  platform: string | null;
  purchased: boolean;
  tracking_code: string | null;
  purchase_amount: string | null;
  payment_fee: string | null;
  shipping_cost: string | null;
  gain_amount: string | null;
  settled: boolean | null;
  purchase_done: boolean;
  order_id: string | null;
  order_label: string | null;
  order_purchase: string | null;
  order_customs: string | null;
  order_freight: string | null;
};

function same(left: unknown, right: unknown) {
  const a = asNumber(left);
  const b = asNumber(right);
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= 0.009;
}

function noteDiffers(note: NoteRow) {
  if (!note.order_id) return false;
  const fields: Array<[unknown, unknown]> = [];
  if (asNumber(note.purchase_amount) != null) fields.push([note.purchase_amount, note.order_purchase]);
  if (asNumber(note.payment_fee) != null) fields.push([note.payment_fee, note.order_customs]);
  if (asNumber(note.shipping_cost) != null) fields.push([note.shipping_cost, note.order_freight]);
  return fields.some(([left, right]) => !same(left, right));
}

function purchaseCell(note: NoteRow) {
  if (asNumber(note.purchase_amount) != null) return brl(note.purchase_amount);
  if (note.purchase_done) return "Feito";
  return "—";
}

function settledCell(settled: boolean | null) {
  if (settled == null) return "—";
  return settled ? "Sim" : "Não";
}

export default async function IntermediacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const sql = db();
  const monthRows = await sql<{ month: string }[]>`
    select distinct to_char(month, 'YYYY-MM') as month
    from ctl_intermediation_notes
    order by month desc
  `;
  const months = monthRows.map((row) => row.month);
  const selected = params.month && months.includes(params.month) ? params.month : months[0];
  if (!selected) {
    return (
      <div className="grid gap-4">
        <h1 className="page-title">Notas de intermediação</h1>
        <p className="text-muted">Nenhuma nota importada.</p>
      </div>
    );
  }

  const notes = await sql<NoteRow[]>`
    select
      n.id, n.line_no, n.order_key, n.label, n.platform, n.purchased, n.tracking_code,
      n.purchase_amount, n.payment_fee, n.shipping_cost, n.gain_amount, n.settled, n.purchase_done,
      n.order_id, o.label as order_label, o.purchase_amount as order_purchase,
      o.import_tax as order_customs, o.shipping_cost as order_freight
    from ctl_intermediation_notes n
    left join ctl_orders o on o.id = n.order_id
    where n.month = ${`${selected}-01`}
    order by (n.purchase_amount is null and n.payment_fee is null and n.shipping_cost is null), n.line_no
  `;
  const withMoney = notes.filter((note) => asNumber(note.purchase_amount) != null || asNumber(note.payment_fee) != null || asNumber(note.shipping_cost) != null);
  const purchaseTotal = withMoney.reduce((sum, note) => sum + (asNumber(note.purchase_amount) ?? 0), 0);
  const feeTotal = withMoney.reduce((sum, note) => sum + (asNumber(note.payment_fee) ?? 0), 0);
  const freightTotal = withMoney.reduce((sum, note) => sum + (asNumber(note.shipping_cost) ?? 0), 0);
  const done = notes.filter((note) => note.purchase_done).length;
  const different = notes.filter(noteDiffers).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Notas de intermediação de {monthLabel(selected)}</h1>
          <p className="max-w-3xl text-sm text-muted">
            Valor comprado, alfândega e frete entram na ficha do pedido. A taxa da planilha é a alfândega. {notes.length} {notes.length === 1 ? "linha" : "linhas"} neste mês{withMoney.length ? `, ${withMoney.length} com valor` : ""}.{done ? ` ${done} ${done === 1 ? "marcada" : "marcadas"} como feito, sem esses valores na planilha.` : ""}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {months.map((month) => (
            <Link key={month} className={month === selected ? "button" : "button secondary"} href={`/intermediacao?month=${month}`}>
              {monthLabel(month)}
            </Link>
          ))}
        </nav>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card stat stat-cost">
          <p className="kicker">Valor comprado</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(purchaseTotal)}</p>
          <p className="mt-1 text-sm text-muted">{withMoney.length} {withMoney.length === 1 ? "nota com valor" : "notas com valor"}</p>
        </article>
        <article className="card stat stat-warn">
          <p className="kicker">Alfândega</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(feeTotal)}</p>
          <p className="mt-1 text-sm text-muted">Taxa da nota, gravada como alfândega</p>
        </article>
        <article className="card stat stat-info">
          <p className="kicker">Frete</p>
          <p className="num mt-2 text-3xl font-medium tracking-tight">{brl(freightTotal)}</p>
          <p className="mt-1 text-sm text-muted">Custo de envio na ficha</p>
        </article>
      </section>

      {different ? (
        <p className="text-sm text-muted">
          {different} {different === 1 ? "nota tem" : "notas têm"} valor diferente do que já estava na ficha. A ficha manteve o valor do financeiro.
        </p>
      ) : null}

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Plataforma</th>
              <th>Comprado</th>
              <th>Rastreio</th>
              <th>Valor comprado</th>
              <th>Alfândega</th>
              <th>Frete</th>
              <th>Ganho</th>
              <th>Realizada</th>
              <th>Ficha</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <tr key={note.id}>
                <td>{note.order_label || note.label || note.order_key}</td>
                <td>{note.platform || "—"}</td>
                <td>{note.purchased ? "Sim" : "Não"}</td>
                <td className="num">{note.tracking_code || "—"}</td>
                <td className="num">{purchaseCell(note)}</td>
                <td className="num">{brl(note.payment_fee)}</td>
                <td className="num">{brl(note.shipping_cost)}</td>
                <td className="num">{brl(note.gain_amount)}</td>
                <td>{settledCell(note.settled)}</td>
                <td>
                  {note.order_id ? (
                    <Link className="underline" href={`/pedidos/${note.order_id}`}>
                      {noteDiffers(note) ? "Valor diferente" : "Abrir"}
                    </Link>
                  ) : (
                    "Sem pedido"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
