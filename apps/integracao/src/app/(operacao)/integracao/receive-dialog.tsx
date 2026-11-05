"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { receiveUnit } from "./actions";

const maxPhotos = 8;
const maxEach = 4 * 1024 * 1024;
const maxTotal = 8 * 1024 * 1024;

export function ReceiveDialog() {
  const [open, setOpen] = useState(false);
  const [previews, setPreviews] = useState<{ url: string; name: string; size: number }[]>([]);
  function close() {
    setOpen(false);
    setPreviews((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

  const total = previews.reduce((sum, item) => sum + item.size, 0);
  const blocked = previews.length > maxPhotos || previews.some((item) => item.size > maxEach) || total > maxTotal;

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files || []);
    setPreviews((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return next.map((file) => ({ url: URL.createObjectURL(file), name: file.name, size: file.size }));
    });
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Receber relógio</button>
      {open ? createPortal(
        <div className="confirm-backdrop" onMouseDown={close}>
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
                Fotos da conferência
                <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required onChange={onPick} />
                <span className="text-xs">De 1 a 8 fotos. Até 4 MB cada e 8 MB no total.</span>
              </label>
              {previews.length ? (
                <div className="photo-picks md:col-span-2">
                  {previews.map((item) => <img key={item.url} src={item.url} alt={item.name} />)}
                </div>
              ) : null}
              {blocked ? <p className="text-sm text-danger md:col-span-2">Reduza a quantidade ou o tamanho das fotos.</p> : null}
              <label className="md:col-span-2">
                Observações
                <textarea name="notes" maxLength={2000} />
              </label>
              <div className="flex gap-2 md:col-span-2">
                <Submit blocked={blocked} />
                <button className="secondary" type="button" onClick={close}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function Submit({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || blocked}>
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
