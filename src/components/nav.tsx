"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    label: "Operação",
    links: [
      { href: "/", label: "Início" },
      { href: "/pedidos", label: "Pedidos" },
      { href: "/estoque", label: "Estoque" },
      { href: "/compras", label: "Compras" },
      { href: "/enderecos", label: "Endereços" },
      { href: "/logins", label: "Logins" },
    ],
  },
  {
    label: "Financeiro",
    links: [
      { href: "/financeiro", label: "Financeiro" },
      { href: "/intermediacao", label: "Intermediação" },
      { href: "/pagamentos", label: "Pagamentos" },
      { href: "/cancelamentos", label: "Cancelamentos" },
    ],
  },
  {
    label: "Ferramentas",
    links: [{ href: "/calculadora", label: "Calculadora" }],
  },
];

export function Nav({ scroll = false }: { scroll?: boolean; admin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={scroll ? "nav-scroll flex flex-nowrap items-end gap-x-6 overflow-x-auto py-2.5" : "flex flex-wrap items-end justify-center gap-x-6 gap-y-2"}>
      {GROUPS.map((group) => (
        <div key={group.label} className="flex shrink-0 items-end gap-x-4">
          <span className="pb-1 text-[10px] uppercase tracking-[0.16em] text-muted">{group.label}</span>
          {group.links.map((link) => {
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
        </div>
      ))}
    </nav>
  );
}
