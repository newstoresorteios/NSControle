"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 8000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      setPending(true);
    }

    function onSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() !== "get") return;
      setPending(true);
    }

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  if (!pending) return null;
  return <div className="nav-progress" role="progressbar" aria-label="Carregando" />;
}
