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

export function OperationNav({ scroll = false }: { scroll?: boolean }) {
  const path = usePathname();
  return (
    <nav className={scroll ? "nav-scroll flex flex-nowrap items-end gap-x-4 overflow-x-auto py-2.5" : "flex flex-wrap items-end gap-x-4 gap-y-2"}>
      <span className="pb-1 text-[10px] uppercase tracking-[0.16em] text-muted">Operação</span>
      {tabs.map(([href, label]) => {
        const active = current(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-0.5 py-1 text-[12px] uppercase tracking-[0.14em] ${
              active ? "border-brand font-medium text-brand" : "border-transparent font-light text-ink hover:border-brand/40 hover:text-brand"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
