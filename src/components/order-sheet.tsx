"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { patchOrder } from "@/app/(painel)/pedidos/actions";

export type SheetMode = "pedidos" | "acompanhamento" | "rastreio" | "entregues";

export type SheetOrder = {
  id: string;
  label: string | null;
  order_key: string;
  origin: string | null;
  product_name: string | null;
  supplier_ref: string | null;
  purchased: boolean;
  cpf_linked: boolean;
  tax_paid: boolean;
  delivered: boolean;
  tracking_code: string | null;
  tracking_situation: string | null;
  tracking_alert: string | null;
  tracking_correios: string | null;
  tracking_event_local: string;
  purchase_date: string | null;
  payment_date: string | null;
  commercial_status: string | null;
  supplier_days: number | null;
  notes_internal: string | null;
  notes_robot: string | null;
  notes_human: string | null;
  days_open: number | null;
};

const COMMERCIAL = ["AGUARDANDO PAGAMENTO", "A ENVIAR VINDI", "A ENVIAR", "ENVIADO", "FINALIZADO", "ENTREGUE", "CANCELADO"];

export function OrderSheet({ rows, mode }: { rows: SheetOrder[]; mode: SheetMode }) {
  return (
    <div className="card sheet">
      <table>
        <thead>
          <tr>
            {mode === "acompanhamento" ? <AcompanhamentoHead /> : null}
            {mode === "rastreio" ? <RastreioHead /> : null}
            {mode === "pedidos" || mode === "entregues" ? <PedidosHead /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {mode === "acompanhamento" ? <AcompanhamentoRow row={row} /> : null}
              {mode === "rastreio" ? <RastreioRow row={row} /> : null}
              {mode === "pedidos" || mode === "entregues" ? <PedidosRow row={row} /> : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12}>Nenhuma linha nesta aba.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <datalist id="origens">
        <option value="Japão" />
        <option value="Europa" />
        <option value="Uscloser" />
        <option value="Portugal" />
        <option value="Tag" />
        <option value="Global Alvaro" />
        <option value="particular" />
        <option value="Loja" />
      </datalist>
    </div>
  );
}

function PedidosHead() {
  return (
    <>
      <th>Pedido</th>
      <th>Origem</th>
      <th className="check">Comprado</th>
      <th>ID</th>
      <th>Produto</th>
      <th>Rastreio</th>
      <th className="check" title="CPF vinculado">CPF</th>
      <th className="check" title="Taxa paga">Taxa</th>
      <th className="check">Entregue</th>
      <th>Obs robô</th>
      <th>Obs humana</th>
    </>
  );
}

function PedidosRow({ row }: { row: SheetOrder }) {
  const save = useSave(row.id);
  return (
    <>
      <OrderCell row={row} status={save.status} />
      <td>
        <TextCell name="origin" value={row.origin} list="origens" onSave={save.run} />
      </td>
      <td className="check">
        <CheckCell name="purchased" checked={row.purchased} onSave={save.run} />
      </td>
      <td>
        <TextCell name="supplier_ref" value={row.supplier_ref} onSave={save.run} />
      </td>
      <td className="wide">
        <TextCell name="product_name" value={row.product_name} onSave={save.run} />
      </td>
      <td>
        <TextCell name="tracking_code" value={row.tracking_code} onSave={save.run} />
      </td>
      <td className="check">
        <CheckCell name="cpf_linked" checked={row.cpf_linked} onSave={save.run} />
      </td>
      <td className="check">
        <CheckCell name="tax_paid" checked={row.tax_paid} onSave={save.run} />
      </td>
      <td className="check">
        <CheckCell name="delivered" checked={row.delivered} onSave={save.run} />
      </td>
      <td className="wide">
        <AreaCell name="notes_robot" value={row.notes_robot} onSave={save.run} />
      </td>
      <td className="wide">
        <AreaCell name="notes_human" value={row.notes_human} onSave={save.run} />
      </td>
    </>
  );
}

function AcompanhamentoHead() {
  return (
    <>
      <th>Pedido</th>
      <th>Compra</th>
      <th>Pagamento</th>
      <th>Status</th>
      <th>Produto</th>
      <th>Obs internas</th>
      <th>Dias</th>
      <th>Dias fornecedor</th>
      <th>Fornecedor</th>
    </>
  );
}

function AcompanhamentoRow({ row }: { row: SheetOrder }) {
  const save = useSave(row.id);
  const statuses = row.commercial_status && !COMMERCIAL.includes(row.commercial_status)
    ? [row.commercial_status, ...COMMERCIAL]
    : COMMERCIAL;
  return (
    <>
      <OrderCell row={row} status={save.status} />
      <td>
        <DateCell name="purchase_date" value={row.purchase_date} onSave={save.run} />
      </td>
      <td>
        <DateCell name="payment_date" value={row.payment_date} onSave={save.run} />
      </td>
      <td className="wide">
        <select
          defaultValue={row.commercial_status ?? ""}
          onChange={(event) => {
            if (event.target.value === (row.commercial_status ?? "")) return;
            save.run({ commercial_status: event.target.value });
          }}
        >
          <option value="">—</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </td>
      <td className="wide">
        <TextCell name="product_name" value={row.product_name} onSave={save.run} />
      </td>
      <td className="wide">
        <AreaCell name="notes_internal" value={row.notes_internal} onSave={save.run} />
      </td>
      <td className="num">{row.days_open ?? "—"}</td>
      <td className="w-24">
        <input
          inputMode="numeric"
          defaultValue={row.supplier_days ?? ""}
          onBlur={(event) => {
            const raw = event.target.value.trim();
            const next = raw === "" ? null : Number(raw);
            if (next !== null && !Number.isInteger(next)) return;
            if (next === row.supplier_days) return;
            save.run({ supplier_days: next });
          }}
        />
      </td>
      <td>
        <TextCell name="origin" value={row.origin} list="origens" onSave={save.run} />
      </td>
    </>
  );
}

function RastreioHead() {
  return (
    <>
      <th>Pedido</th>
      <th>Origem</th>
      <th>Código</th>
      <th>Status Correios</th>
      <th>Situação</th>
      <th>Alerta</th>
      <th>Data</th>
      <th className="check">Entregue</th>
    </>
  );
}

function RastreioRow({ row }: { row: SheetOrder }) {
  const save = useSave(row.id);
  return (
    <>
      <OrderCell row={row} status={save.status} />
      <td>
        <TextCell name="origin" value={row.origin} list="origens" onSave={save.run} />
      </td>
      <td>
        <TextCell name="tracking_code" value={row.tracking_code} onSave={save.run} />
      </td>
      <td className="wide">
        <TextCell name="tracking_correios" value={row.tracking_correios} onSave={save.run} />
      </td>
      <td className="wide">
        <TextCell name="tracking_situation" value={row.tracking_situation} onSave={save.run} />
      </td>
      <td className="wide">
        <AreaCell name="tracking_alert" value={row.tracking_alert} onSave={save.run} />
      </td>
      <td>
        <input
          type="datetime-local"
          defaultValue={row.tracking_event_local}
          onChange={(event) => {
            if (event.target.value === row.tracking_event_local) return;
            save.run({ tracking_event_at: event.target.value });
          }}
        />
      </td>
      <td className="check">
        <CheckCell name="delivered" checked={row.delivered} onSave={save.run} />
      </td>
    </>
  );
}

function OrderCell({ row, status }: { row: SheetOrder; status: SaveStatus }) {
  return (
    <td className="min-w-36 whitespace-nowrap">
      <Link href={`/pedidos/${row.id}`} className="underline">
        {row.label || row.order_key}
      </Link>
      <div className="text-xs text-muted">{status === "idle" ? "\u00a0" : STATUS_LABEL[status]}</div>
    </td>
  );
}

function TextCell({
  name,
  value,
  onSave,
  list,
}: {
  name: string;
  value: string | null;
  onSave: (patch: Record<string, unknown>) => void;
  list?: string;
}) {
  return (
    <input
      list={list}
      defaultValue={value ?? ""}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next === (value ?? "")) return;
        onSave({ [name]: next });
      }}
    />
  );
}

function AreaCell({
  name,
  value,
  onSave,
}: {
  name: string;
  value: string | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  return (
    <textarea
      rows={2}
      defaultValue={value ?? ""}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next === (value ?? "")) return;
        onSave({ [name]: next });
      }}
    />
  );
}

function CheckCell({
  name,
  checked,
  onSave,
}: {
  name: string;
  checked: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      aria-label={name}
      onChange={(event) => onSave({ [name]: event.target.checked })}
    />
  );
}

function DateCell({
  name,
  value,
  onSave,
}: {
  name: string;
  value: string | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const current = value ? String(value).slice(0, 10) : "";
  return (
    <input
      type="date"
      defaultValue={current}
      onChange={(event) => {
        if (event.target.value === current) return;
        onSave({ [name]: event.target.value });
      }}
    />
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "salvando…",
  saved: "salvo",
  error: "não salvou",
};

function useSave(id: string) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef(0);

  function run(patch: Record<string, unknown>) {
    const ticket = ++pending.current;
    setStatus("saving");
    void patchOrder(id, patch).then((result) => {
      if (pending.current === ticket) setStatus(result.ok ? "saved" : "error");
    });
  }

  return { status, run };
}
