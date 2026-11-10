"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/intermediacao", label: "Intermediação" },
  { href: "/pagamentos", label: "Pagamentos" },
  { href: "/estoque", label: "Estoque" },
  { href: "/compras", label: "Compras" },
  { href: "/cancelamentos", label: "Cancelamentos" },
  { href: "/calculadora", label: "Calculadora" },
];

export function Nav({ scroll = false, admin = false }: { scroll?: boolean; admin?: boolean }) {
  const pathname = usePathname();
  const links = admin ? [...LINKS, { href: "/usuarios", label: "Usuários" }] : LINKS;
  return (
    <nav
      className={
        scroll
          ? "nav-scroll flex flex-nowrap items-center gap-x-5 overflow-x-auto py-2.5"
          : "flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
      }
    >
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 border-b-2 px-0.5 py-1 text-[12px] uppercase tracking-[0.14em] ${
              active ? "border-brand font-medium text-brand" : "border-transparent font-light text-ink hover:border-brand/40 hover:text-brand"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
