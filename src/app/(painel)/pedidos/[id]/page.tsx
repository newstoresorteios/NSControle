import Link from "next/link";
import { notFound } from "next/navigation";
import { updateOrder } from "@/app/(painel)/pedidos/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { asNumber, brl, money, shortDate } from "@/lib/format";

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireTeam();
  const sql = db();
  const [found, payments] = await Promise.all([
    sql`select * from ctl_orders where id = ${id} limit 1`,
    sql<OrderPayment[]>`
      select k.id as link_id, i.id as invoice_id, i.supplier_name, i.invoice_number, i.currency, i.status,
        l.reference, l.description, l.quantity, l.line_amount
      from ctl_supplier_invoice_links k
      join ctl_supplier_invoice_lines l on l.id = k.line_id
      join ctl_supplier_invoices i on i.id = l.invoice_id
      where k.order_id = ${id}
      order by i.invoice_date desc nulls last, l.line_no
    `,
  ]);
  const order = found[0];
  if (!order) notFound();
  const monthValue = order.finance_month ? String(order.finance_month).slice(0, 7) : "";

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/pedidos" className="text-sm text-muted">
          Voltar aos pedidos
        </Link>
        <h1 className="page-title mt-2">{order.label || order.order_key}</h1>
        <p className="num text-muted">Ganho calculado: {brl(order.gain_amount)}</p>
      </div>
      {query.ok ? <p className="text-sm text-ok">Ficha atualizada.</p> : null}
      {query.erro ? <p className="text-sm text-danger">Não foi possível salvar.</p> : null}
      {order.notes_tray ? (
        <section className="card text-sm">
          <h2 className="section-title">Loja</h2>
          <p className="mt-2 whitespace-pre-wrap text-muted">{order.notes_tray}</p>
        </section>
      ) : null}
      {payments.length ? (
        <section className="card text-sm">
          <h2 className="section-title">Pagamentos</h2>
          <ul className="mt-3 grid gap-2">
            {payments.map((item) => (
              <li key={item.link_id}>
                <Link className="underline" href={`/pagamentos/${item.invoice_id}`}>
                  {item.invoice_number || "Fatura"}
                </Link>
                {item.supplier_name ? ` · ${item.supplier_name}` : ""}
                {" · "}
                {item.reference || item.description || "—"}
                {item.quantity != null ? ` · ${pieces(item.quantity)} un` : ""}
                {" · "}
                <span className="num">{money(item.line_amount, item.currency)}</span>
                {item.status === "rascunho" ? " · aguardando confirmação" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form action={updateOrder} className="card grid gap-3 md:grid-cols-3">
        <input type="hidden" name="id" value={order.id} />
        <Field label="Número" name="order_key" defaultValue={order.order_key} required />
        <Field label="Rótulo" name="label" defaultValue={order.label} />
        <label className="grid gap-1 text-sm">
          Fluxo
          <select name="flow" defaultValue={order.flow}>
            <option value="encomenda">Sob encomenda</option>
            <option value="loja_nova">Loja nova</option>
            <option value="ns_creditos">NS Créditos</option>
          </select>
        </label>
        <Field label="Origem" name="origin" defaultValue={order.origin} />
        <Field label="Referência" name="reference" defaultValue={order.reference} />
        <Field label="Produto" name="product_name" defaultValue={order.product_name} />
        <Field label="Status comercial" name="commercial_status" defaultValue={order.commercial_status} />
        <Field label="Status da compra" name="sourcing_status" defaultValue={order.sourcing_status} />
        <label className="grid gap-1 text-sm">
          Mês financeiro
          <input name="finance_month" type="month" defaultValue={monthValue} />
        </label>
        <Field label="Rastreio" name="tracking_code" defaultValue={order.tracking_code} />
        <Field label="Situação" name="tracking_situation" defaultValue={order.tracking_situation} />
        <Field label="Status Correios" name="tracking_correios" defaultValue={order.tracking_correios} />
        <label className="grid gap-1 text-sm md:col-span-3">
          Alerta
          <textarea name="tracking_alert" defaultValue={order.tracking_alert || ""} />
        </label>
        <Field label="Evento do rastreio" name="tracking_event_at" type="datetime-local" defaultValue={localDateTime(order.tracking_event_at)} />
        <Field label="Compra" name="purchase_date" type="date" defaultValue={dateInput(order.purchase_date)} />
        <Field label="Pagamento" name="payment_date" type="date" defaultValue={dateInput(order.payment_date)} />
        <Field label="Dias do fornecedor" name="supplier_days" defaultValue={order.supplier_days} />
        <Field label="Valor de venda" name="sale_amount" defaultValue={order.sale_amount} />
        <Field label="Valor de compra (R$)" name="purchase_amount" defaultValue={order.purchase_amount} />
        {order.purchase_foreign_amount != null ? (
          <p className="text-sm text-muted md:col-span-3">
            Na moeda: {money(order.purchase_foreign_amount, order.purchase_currency || "EUR")}
            {order.purchase_fx_rate != null
              ? ` · PTAX ${Number(order.purchase_fx_rate).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} em ${shortDate(order.purchase_fx_date)}`
              : ""}
          </p>
        ) : null}
        <Field label="Taxa de pagamento" name="payment_fee" defaultValue={order.payment_fee} />
        <Field label="Custo de envio" name="shipping_cost" defaultValue={order.shipping_cost} />
        <Field label="Taxa de importação" name="import_tax" defaultValue={order.import_tax} />
        <div className="flex flex-wrap gap-4 text-sm md:col-span-3">
          <Check name="purchased" label="Comprado" defaultChecked={order.purchased} />
          <Check name="cpf_linked" label="CPF vinculado" defaultChecked={order.cpf_linked} />
          <Check name="tax_paid" label="Taxa paga" defaultChecked={order.tax_paid} />
          <Check name="delivered" label="Entregue" defaultChecked={order.delivered} />
        </div>
        <label className="grid gap-1 text-sm md:col-span-3">
          Observações internas
          <textarea name="notes_internal" defaultValue={order.notes_internal || ""} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-3">
          Observações humanas
          <textarea name="notes_human" defaultValue={order.notes_human || ""} />
        </label>
        <button type="submit" className="md:w-fit">
          Salvar ficha
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} />
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <input className="w-auto" type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

function pieces(value: number | string | null) {
  const number = asNumber(value);
  if (number == null) return "—";
  return Number.isInteger(number) ? String(number) : number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

type OrderPayment = {
  link_id: string;
  invoice_id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  currency: string;
  status: string;
  reference: string | null;
  description: string | null;
  quantity: number | string | null;
  line_amount: number | string | null;
};

function dateInput(value: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
