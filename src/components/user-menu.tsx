"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";

export function UserMenu({ name }: { name: string }) {
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
    <div className="relative">
      <button className="user-button secondary" type="button" aria-label="Conta" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.2 13.2c.7-2.2 2.4-3.3 4.8-3.3s4.1 1.1 4.8 3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 border border-line bg-white p-3">
          <p className="truncate text-sm text-ink">{name}</p>
          <Link href="/conta" className="mt-3 block text-sm underline" onClick={() => setOpen(false)}>
            Alterar senha
          </Link>
          <form action={signOut} className="mt-3">
            <button className="secondary" type="submit">Sair</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
