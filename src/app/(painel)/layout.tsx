import { after } from "next/server";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { requireTeam } from "@/lib/auth";
import { scheduleCorreiosSync } from "@/lib/correios-sync";
import { scheduleTraySync } from "@/lib/tray-sync";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireTeam();
  after(async () => {
    await scheduleTraySync();
    await scheduleCorreiosSync();
  });
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="sticky top-0 z-20">
        <div className="bg-ink px-4 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-white">
          New Store · Controle interno
        </div>
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-[1600px] items-center gap-x-8 px-4 py-3 sm:px-5">
            <Link href="/" aria-label="Início" className="shrink-0">
              <Logo height={24} />
            </Link>
            <div className="hidden min-w-0 flex-1 lg:block">
              <Nav />
            </div>
            <form action={signOut} className="ml-auto flex items-center gap-3">
              <span className="hidden max-w-52 truncate text-xs tracking-wide text-muted sm:inline">{email}</span>
              <button className="secondary" type="submit">
                Sair
              </button>
            </form>
          </div>
          <div className="relative border-t border-line lg:hidden">
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent" />
            <div className="mx-auto max-w-[1600px] px-4 sm:px-5">
              <Nav scroll />
            </div>
          </div>
        </header>
      </div>
      <AutoRefresh />
      <main className="mx-auto max-w-[1600px] px-5 py-8">{children}</main>
    </div>
  );
}
