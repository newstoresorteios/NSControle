import { after } from "next/server";
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
    <div className="min-h-screen">
      <header className="border-b border-[#e2d9cc] bg-[#fffdf8]">
        <div className="mx-auto grid max-w-[1600px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3">
          <Logo height={26} />
          <Nav />
          <form action={signOut} className="flex items-center gap-3 text-sm">
            <span className="text-[#6d645b]">{email}</span>
            <button className="secondary" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>
      <AutoRefresh />
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
