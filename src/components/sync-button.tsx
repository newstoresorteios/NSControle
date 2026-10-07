"use client";

import { useFormStatus } from "react-dom";

export function SyncButton({ idle, pendingLabel }: { idle: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : idle}
    </button>
  );
}

export function SyncStatus({
  pendingLabel,
  message,
  tone,
}: {
  pendingLabel: string;
  message: string | null;
  tone: "ok" | "danger" | "muted";
}) {
  const { pending } = useFormStatus();
  const text = pending ? pendingLabel : message;
  if (!text) return null;
  const color = pending ? "" : tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-muted";
  return (
    <p className={`max-w-xs text-right text-sm ${color}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}
