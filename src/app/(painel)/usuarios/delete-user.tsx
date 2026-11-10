"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { removeUser } from "./actions";

export function DeleteUser({ id, name }: { id: string; name: string }) {
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
      <button className="danger" type="button" onClick={() => setOpen(true)}>Excluir</button>
      {open ? createPortal(
        <div className="confirm-backdrop" onMouseDown={() => setOpen(false)}>
          <div className="card confirm" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="section-title">Excluir usuário</h2>
            <p className="mt-3 text-sm">Excluir o acesso de {name}?</p>
            <div className="mt-4 flex gap-2">
              <form action={removeUser}>
                <input type="hidden" name="id" value={id} />
                <button className="danger" type="submit">Sim</button>
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
