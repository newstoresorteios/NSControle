"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/estoque", label: "Estoque" },
  { href: "/compras", label: "Compras" },
  { href: "/cancelamentos", label: "Cancelamentos" },
  { href: "/calculadora", label: "Calculadora" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap justify-center gap-1">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-1 text-sm ${active ? "bg-[#8f3d2b] text-white" : "text-[#1c1915] hover:bg-[#efe7db]"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
