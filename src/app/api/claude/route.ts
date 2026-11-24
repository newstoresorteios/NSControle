import { claudeAuthorized, claudeConfigured, claudeGet, claudePanelAllowed, claudePost } from "@/lib/claude-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(request: Request) {
  if (claudeAuthorized(request) || (await claudePanelAllowed())) return null;
  if (!claudeConfigured()) {
    return Response.json({ ok: false, erro: "token_nao_configurado" }, { status: 503 });
  }
  return Response.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
}

export async function GET(request: Request) {
  const blocked = await gate(request);
  if (blocked) return blocked;
  try {
    const body = await claudeGet(new URL(request.url));
    return Response.json(body);
  } catch {
    return Response.json({ ok: false, erro: "falha" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = await gate(request);
  if (blocked) return blocked;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, erro: "json_invalido" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ ok: false, erro: "json_invalido" }, { status: 400 });
  }
  try {
    const result = await claudePost(payload as Record<string, unknown>);
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, erro: "falha" }, { status: 500 });
  }
}
