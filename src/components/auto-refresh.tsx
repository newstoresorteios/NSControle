"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { pullRemoteUpdates } from "@/app/(painel)/refresh-actions";

const FIRST_DELAY_MS = 15_000;
const INTERVAL_MS = 90_000;

let nextPullAt = 0;

function editing() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function AutoRefresh() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (nextPullAt === 0) nextPullAt = Date.now() + FIRST_DELAY_MS;
    let interval = 0;
    let stopped = false;

    async function tick() {
      if (stopped) return;
      nextPullAt = Date.now() + INTERVAL_MS;
      try {
        const changed = await pullRemoteUpdates();
        if (!stopped && changed && !editing()) routerRef.current.refresh();
      } catch {
        // A próxima rodada tenta de novo.
      }
    }

    const start = window.setTimeout(() => {
      void tick();
      interval = window.setInterval(() => void tick(), INTERVAL_MS);
    }, Math.max(0, nextPullAt - Date.now()));

    return () => {
      stopped = true;
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
