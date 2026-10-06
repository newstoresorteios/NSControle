import Link from "next/link";
import { createCancellation } from "@/app/(painel)/cancelamentos/actions";
import { requireTeam } from "@/lib/auth";
import { brl, shortDate } from "@/lib/format";

export default async function CancelamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireTeam();
  const { data } = await supabase
    .from("ctl_cancellations")
    .select("id, order_id, order_key, model, amount, due_date, done_date, status, gateway, refund_method, bank_details, reason")
    .order("due_date", { ascending: false, nullsFirst: false });

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Cancelamentos</h1>
        <p className="text-[#6d645b]">Estornos e a data combinada para devolver.</p>
      </div>
      {params.erro ? <p className="text-sm text-[#8f3d2b]">Não foi possível registrar o cancelamento.</p> : null}
      <details className="card">
        <summary className="cursor-pointer font-semibold">Novo cancelamento</summary>
        <form action={createCancellation} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">Pedido<input name="order_key" /></label>
          <label className="grid gap-1 text-sm">Modelo<input name="model" /></label>
          <label className="grid gap-1 text-sm">Valor<input name="amount" /></label>
          <label className="grid gap-1 text-sm">Meio<input name="gateway" placeholder="vindi" /></label>
          <label className="grid gap-1 text-sm">Modo do estorno<input name="refund_method" /></label>
          <label className="grid gap-1 text-sm">Status<input name="status" defaultValue="Cancelado" /></label>
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
              <th>Status</th>
              <th>Meio</th>
              <th>Banco</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((item) => (
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
                <td>{shortDate(item.due_date)}</td>
                <td>{item.status || "—"}</td>
                <td>{item.gateway || item.refund_method || "—"}</td>
                <td>{item.bank_details || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
