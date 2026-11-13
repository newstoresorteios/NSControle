"use client";

import { useState } from "react";
import { revealSecret } from "@/app/(painel)/logins/actions";

export function VaultSecret({ id, locked }: { id: string; locked: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!locked) return <span className="text-muted">—</span>;
  if (value) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{value}</span>
        <button className="secondary" type="button" onClick={() => navigator.clipboard.writeText(value)}>
          Copiar
        </button>
        <button className="secondary" type="button" onClick={() => setValue(null)}>
          Ocultar
        </button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          const opened = await revealSecret(id);
          setBusy(false);
          if (!opened) {
            setFailed(true);
            return;
          }
          setValue(opened);
        }}
      >
        {busy ? "Abrindo" : "Ver senha"}
      </button>
      {failed ? <span className="text-sm text-danger">Não foi possível abrir.</span> : null}
    </span>
  );
}
