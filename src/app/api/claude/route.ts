import { claudeAuthorized, claudeConfigured, claudeGet, claudePost } from "@/lib/claude-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function denied() {
  if (!claudeConfigured()) {
    return Response.json({ ok: false, erro: "token_nao_configurado" }, { status: 503 });
  }
  return Response.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!claudeAuthorized(request)) return denied();
  try {
    const body = await claudeGet(new URL(request.url));
    return Response.json(body);
  } catch {
    return Response.json({ ok: false, erro: "falha" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!claudeAuthorized(request)) return denied();
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
