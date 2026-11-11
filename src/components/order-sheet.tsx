"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { patchOrder, requestAnaPurchase } from "@/app/(painel)/pedidos/actions";
import { shortDate } from "@/lib/format";
import { COMMERCIAL_STATUSES, ORIGINS, shipmentLabel, withCurrent } from "@/lib/lists";

export type SheetMode = "pedidos" | "acompanhamento" | "rastreio" | "entregues";

export type SheetOrder = {
  id: string;
  label: string | null;
  order_key: string;
  origin: string | null;
  product_name: string | null;
  supplier_ref: string | null;
  supplier_name: string | null;
  supplier_purchase_date: string | null;
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
  notes_tray: string | null;
  days_open: number | null;
  ana_requested: boolean;
  tax_payment: string | null;
};

function listTone(status: string | null, delivered = false) {
  const value = (status || "").toUpperCase();
  if (value === "CANCELADO") return "danger";
  if (delivered || value === "ENTREGUE" || value === "FINALIZADO") return "ok";
  if (value === "ENVIADO" || value.includes("ENVIAR")) return "info";
  if (value.includes("AGUARD")) return "warn";
  return "";
}

export function OrderSheet({
  rows,
  mode,
  returnTo = "/pedidos?aba=pedidos",
  emptyLabel = "Nenhuma linha nesta aba.",
}: {
  rows: SheetOrder[];
  mode: SheetMode;
  returnTo?: string;
  emptyLabel?: string;
}) {
  const ana = mode === "pedidos";
  return (
    <div className="card sheet">
      <div className="flex flex-wrap gap-2 px-3 pt-3 text-xs">
        <span className="tag tag-muted">Aguardando</span>
        <span className="tag tag-info">A enviar / enviado</span>
        <span className="tag tag-ok">Entregue</span>
        <span className="tag tag-danger">Cancelado</span>
        <span className="tag tag-warn">Prazo do fornecedor estourado</span>
      </div>
      <table>
        <thead>
          <tr>
            {mode === "acompanhamento" ? <AcompanhamentoHead /> : null}
            {mode === "rastreio" ? <RastreioHead /> : null}
            {mode === "pedidos" || mode === "entregues" ? <PedidosHead ana={ana} /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-tone={listTone(row.commercial_status, row.delivered) || undefined}>
              {mode === "acompanhamento" ? <AcompanhamentoRow row={row} /> : null}
              {mode === "rastreio" ? <RastreioRow row={row} /> : null}
              {mode === "pedidos" || mode === "entregues" ? <PedidosRow row={row} ana={ana} returnTo={returnTo} /> : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12}>{emptyLabel}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PedidosHead({ ana }: { ana: boolean }) {
  return (
    <>
      <th className={ana ? "pin pin-order" : undefined}>Pedido</th>
      <th>Origem</th>
      {ana ? <th className="pin pin-ana">Ana</th> : null}
      <th className="check">Comprado</th>
      <th>ID</th>
      <th>Produto</th>
      <th>Rastreio</th>
      <th className="check" title="CPF vinculado">CPF</th>
      <th className="check" title="Taxa paga">Taxa</th>
      <th className="check">Entregue</th>
      <th>Obs internas</th>
      <th></th>
    </>
  );
}

function PedidosRow({ row, ana, returnTo }: { row: SheetOrder; ana: boolean; returnTo: string }) {
  const save = useSave(row.id);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <OrderCell row={row} status={save.status} pin={ana} />
      <td>
        {editing ? <ChoiceCell name="origin" value={row.origin} options={ORIGINS} onSave={save.run} /> : clip(row.origin)}
      </td>
      {ana ? (
        <td className="pin pin-ana">
          {row.ana_requested ? (
            <span className="text-xs text-muted">Com a Ana</span>
          ) : (
            <RequestAna id={row.id} orderKey={row.order_key} returnTo={returnTo} />
          )}
        </td>
      ) : null}
      <td className="check">
        {editing ? <CheckCell name="purchased" checked={row.purchased} onSave={save.run} /> : mark(row.purchased)}
      </td>
      <td>{editing ? <TextCell name="supplier_ref" value={row.supplier_ref} onSave={save.run} /> : clip(row.supplier_ref)}</td>
      <td className="wide">{editing ? <TextCell name="product_name" value={row.product_name} onSave={save.run} /> : clip(row.product_name)}</td>
      <td>{editing ? <TextCell name="tracking_code" value={row.tracking_code} onSave={save.run} /> : clip(row.tracking_code)}</td>
      <td className="check">
        {editing ? <CheckCell name="cpf_linked" checked={row.cpf_linked} onSave={save.run} /> : mark(row.cpf_linked)}
      </td>
      <td className={row.tax_payment ? "tax-pay" : "check"}>
        {editing ? <CheckCell name="tax_paid" checked={row.tax_paid} onSave={save.run} /> : mark(row.tax_paid)}
        {row.tax_payment ? <PayTaxButton text={row.tax_payment} /> : null}
      </td>
      <td className="check">
        {editing ? <CheckCell name="delivered" checked={row.delivered} onSave={save.run} /> : mark(row.delivered)}
      </td>
      <td className="wide">
        {editing ? <AreaCell name="notes_internal" value={row.notes_internal} onSave={save.run} /> : clip(row.notes_internal)}
      </td>
      <td><EditButton editing={editing} onClick={() => setEditing((value) => !value)} /></td>
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
      <th>Rastreio</th>
      <th>Produto</th>
      <th>Obs internas</th>
      <th>Dias</th>
      <th>Dias fornecedor</th>
      <th>Fornecedor</th>
      <th>Nome do fornecedor</th>
      <th>Compra ao fornecedor</th>
      <th></th>
    </>
  );
}

function AcompanhamentoRow({ row }: { row: SheetOrder }) {
  const save = useSave(row.id);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(row.commercial_status ?? "");
  useEffect(() => {
    setStatus(row.commercial_status ?? "");
  }, [row.commercial_status]);
  const late = row.supplier_days != null && row.days_open != null && row.days_open > row.supplier_days;
  const tone = listTone(status, row.delivered);
  return (
    <>
      <OrderCell row={row} status={save.status} />
      <td>{editing ? <DateCell name="purchase_date" value={row.purchase_date} onSave={save.run} /> : shortDate(row.purchase_date)}</td>
      <td>{editing ? <DateCell name="payment_date" value={row.payment_date} onSave={save.run} /> : shortDate(row.payment_date)}</td>
      <td className="wide">
        {editing ? (
          <select
            className={tone ? `tone-${tone}` : undefined}
            value={status}
            onChange={(event) => {
              const next = event.target.value;
              setStatus(next);
              if (next === (row.commercial_status ?? "")) return;
              save.run({ commercial_status: next });
            }}
          >
            <option value="">—</option>
            {withCurrent(COMMERCIAL_STATUSES, status).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : (
          <StatusTag value={status} delivered={row.delivered} />
        )}
      </td>
      <td>{editing ? <TextCell name="tracking_code" value={row.tracking_code} onSave={save.run} /> : clip(row.tracking_code)}</td>
      <td className="wide">{editing ? <TextCell name="product_name" value={row.product_name} onSave={save.run} /> : clip(row.product_name)}</td>
      <td className="wide">{editing ? <AreaCell name="notes_internal" value={row.notes_internal} onSave={save.run} /> : clip(row.notes_internal)}</td>
      <td className={`num ${late ? "text-danger font-medium" : ""}`}>{row.days_open ?? "—"}</td>
      <td className="w-24">
        {editing ? (
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
        ) : (
          row.supplier_days ?? "—"
        )}
      </td>
      <td>{editing ? <ChoiceCell name="origin" value={row.origin} options={ORIGINS} onSave={save.run} /> : clip(row.origin)}</td>
      <td>{editing ? <TextCell name="supplier_name" value={row.supplier_name} onSave={save.run} /> : clip(row.supplier_name)}</td>
      <td>{editing ? <DateCell name="supplier_purchase_date" value={row.supplier_purchase_date} onSave={save.run} /> : shortDate(row.supplier_purchase_date)}</td>
      <td><EditButton editing={editing} onClick={() => setEditing((value) => !value)} /></td>
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
        <TextCell name="origin" value={row.origin} onSave={save.run} />
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

function OrderCell({ row, status, pin = false }: { row: SheetOrder; status: SaveStatus; pin?: boolean }) {
  const number = shipmentLabel(row.order_key, row.label);
  const label = (row.label || "").trim();
  const extra = label && label !== number && label !== `Pedido ${number}` ? label : null;
  return (
    <td className={pin ? "pin pin-order min-w-36 whitespace-nowrap" : "min-w-36 whitespace-nowrap"}>
      <div className="flex items-baseline gap-2">
        <Link href={`/pedidos/${row.id}`} className="num underline">
          {number}
        </Link>
        <span className="num text-xs text-muted" title="Data do pedido">
          {shortDate(row.purchase_date)}
        </span>
      </div>
      <div className="text-xs text-muted">{extra || (status === "idle" ? "\u00a0" : STATUS_LABEL[status])}</div>
      {extra && status !== "idle" ? <div className="text-xs text-muted">{STATUS_LABEL[status]}</div> : null}
    </td>
  );
}

function StatusTag({ value, delivered = false }: { value: string | null; delivered?: boolean }) {
  const tone = listTone(value, delivered) || "muted";
  const label = value || (delivered ? "Entregue" : "—");
  return <span className={`tag tag-${tone}`}>{label}</span>;
}

function clip(value: string | null) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return <span className="text-muted">—</span>;
  return <span className="clip" title={text}>{text}</span>;
}

function mark(on: boolean) {
  return on ? <span className="text-ok">✓</span> : <span className="text-muted">—</span>;
}

function EditButton({ editing, onClick }: { editing: boolean; onClick: () => void }) {
  return (
    <button className="secondary" type="button" onClick={onClick}>
      {editing ? "Fechar" : "Editar"}
    </button>
  );
}

function ChoiceCell({
  name,
  value,
  options,
  onSave,
}: {
  name: string;
  value: string | null;
  options: readonly string[];
  onSave: (patch: Record<string, unknown>) => void;
}) {
  return (
    <select
      defaultValue={value ?? ""}
      onChange={(event) => {
        const next = event.target.value;
        if (next === (value ?? "")) return;
        onSave({ [name]: next });
      }}
    >
      <option value="">—</option>
      {withCurrent(options, value).map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
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

function fitNote(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
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
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) fitNote(ref.current);
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={2}
      defaultValue={value ?? ""}
      onInput={(event) => fitNote(event.currentTarget)}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next === (value ?? "")) return;
        onSave({ [name]: next });
      }}
    />
  );
}

function RequestAna({ id, orderKey, returnTo }: { id: string; orderKey: string; returnTo: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="secondary" type="button" onClick={() => setOpen(true)}>Solicitar ANA</button>
      {open ? createPortal(
        <div className="confirm-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="card confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`ana-${id}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id={`ana-${id}`} className="section-title">Enviar para a Ana</h2>
            <p className="mt-3 text-sm">Enviar o pedido {orderKey} para a Ana comprar?</p>
            <div className="mt-4 flex gap-2">
              <form action={requestAnaPurchase}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="retorno" value={returnTo} />
                <button className="ok" type="submit">Sim</button>
              </form>
              <button className="no" type="button" onClick={() => setOpen(false)}>Não</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function PayTaxButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="warn" type="button" onClick={() => { setCopied(false); setOpen(true); }}>Pagar taxa</button>
      {open ? createPortal(
        <div className="confirm-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="card confirm confirm-tax"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pagar-taxa"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="pagar-taxa" className="section-title">Pagar taxa</h2>
            <pre className="tax-slip">{text}</pre>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { void copyText(text).then(setCopied); }}>{copied ? "Copiado" : "Copiar"}</button>
              <button className="secondary" type="button" onClick={() => setOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
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
