"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["/integracao/compras", "Compras"],
  ["/integracao", "Recebimento"],
  ["/integracao/estoque", "Estoque"],
  ["/integracao/expedicao", "Expedição"],
  ["/integracao/transporte", "Transporte"],
  ["/integracao/controle", "Controle"],
] as const;

function current(path: string, href: string) {
  if (href === "/integracao/estoque") {
    return path === href || path.startsWith("/integracao/galeria") || path.startsWith("/integracao/foto") || path.startsWith("/integracao/etiqueta");
  }
  if (href === "/integracao") return path === "/integracao";
  return path === href || path.startsWith(`${href}/`);
}

export function OperationNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-[1400px] flex-wrap gap-6 px-5 pb-4 text-sm">
      {tabs.map(([href, label]) => {
        const active = current(path, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "nav-current" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
