"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export function ConfirmDelete({
  action,
  fields,
  title,
  message,
  label = "Excluir",
  confirmLabel = "Sim, excluir",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  title: string;
  message: string;
  label?: string;
  confirmLabel?: string;
}) {
  const titleId = useId();
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
      <button className="danger" type="button" onClick={() => setOpen(true)}>{label}</button>
      {open ? createPortal(
        <div className="confirm-backdrop" onMouseDown={() => setOpen(false)}>
          <div className="card confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
            <h2 id={titleId} className="section-title">{title}</h2>
            <p className="mt-3 text-sm">{message}</p>
            <div className="mt-4 flex gap-2">
              <form action={action}>
                {Object.entries(fields).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <button className="danger" type="submit">{confirmLabel}</button>
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
