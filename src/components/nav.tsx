"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Início", tone: "text-brand border-brand" },
  { href: "/pedidos", label: "Pedidos", tone: "text-brand border-brand" },
  { href: "/estoque", label: "Estoque", tone: "text-brand border-brand" },
  { href: "/compras", label: "Compras", tone: "text-brand border-brand" },
  { href: "/enderecos", label: "Endereços", tone: "text-brand border-brand" },
  { href: "/logins", label: "Logins", tone: "text-brand border-brand" },
  { href: "/financeiro", label: "Financeiro", tone: "text-ok border-ok" },
  { href: "/intermediacao", label: "Intermediação", tone: "text-ok border-ok" },
  { href: "/pagamentos", label: "Pagamentos", tone: "text-ok border-ok" },
  { href: "/cancelamentos", label: "Cancelamentos", tone: "text-ok border-ok" },
  { href: "/calculadora", label: "Calculadora", tone: "text-info border-info" },
  { href: "/apis", label: "APIs", tone: "text-info border-info" },
] as const;

export function Nav({ scroll = false }: { scroll?: boolean; admin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={scroll ? "nav-scroll flex flex-nowrap items-end gap-x-4 overflow-x-auto py-2.5" : "flex flex-wrap items-end justify-center gap-x-4 gap-y-2"}>
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-0.5 py-1 text-[12px] uppercase tracking-[0.14em] ${link.tone} ${
              active ? "font-medium" : "border-transparent font-light hover:border-current"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
