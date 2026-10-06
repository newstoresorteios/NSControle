import { timingSafeEqual } from "node:crypto";
import { runTraySync } from "@/lib/tray-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.TRAY_SYNC_SECRET?.trim() || "";
  const header = request.headers.get("authorization") || "";
  const supplied = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function statusFor(reason: string, ok: boolean) {
  if (reason === "limite") return 429;
  if (reason === "nao_configurado") return 503;
  return ok ? 200 : 502;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, reason: "nao_autorizado" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const report = await runTraySync({ force });
  return Response.json(report, { status: statusFor(report.reason, report.ok) });
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
