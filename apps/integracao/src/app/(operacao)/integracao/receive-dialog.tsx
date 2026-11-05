"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { receiveUnit } from "./actions";

export function ReceiveDialog() {
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
    <div id="recebimento">
      <button type="button" onClick={() => setOpen(true)}>Receber relógio</button>
      {open ? createPortal(
        <div className="confirm-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="card confirm confirm-receive"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receber-relogio"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="receber-relogio" className="section-title">Receber relógio</h2>
            <p className="my-3 text-sm text-muted">O ID é gerado automaticamente. A unidade ficará disponível para a New Store solicitar um envio.</p>
            <form action={receiveUnit} className="grid gap-3 md:grid-cols-2">
              <Field name="brand" label="Marca" />
              <Field name="model" label="Modelo / referência" required />
              <Field name="serial_number" label="Número de série" required />
              <Field name="location" label="Localização física" required />
              <Field name="weight_g" label="Peso do produto com caixa (g)" type="number" required />
              <label>
                Foto da conferência
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
                <span className="text-xs">Até 4 MB</span>
              </label>
              <label className="md:col-span-2">
                Observações
                <textarea name="notes" maxLength={2000} />
              </label>
              <div className="flex gap-2 md:col-span-2">
                <Submit />
                <button className="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? <span className="spinner" /> : null}
      Cadastrar recebimento
    </button>
  );
}

function Field({ name, label, required = false, type = "text" }: { name: string; label: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1">
      {label}
      <input name={name} type={type} required={required} maxLength={type === "text" ? 500 : undefined} min={type === "number" ? 1 : undefined} step={type === "number" ? "any" : undefined} />
    </label>
  );
}
