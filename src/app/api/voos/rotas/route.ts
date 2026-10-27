import { NextResponse } from "next/server";
import { getSession, relyingParty } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { FlightsApiError, flightsApi, type RoutesConfig } from "@/lib/flights-api";

function fail(err: unknown) {
  const e = err instanceof FlightsApiError ? err : new FlightsApiError((err as Error).message, 500);
  return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
}

// Resumo do que mudou, para a atividade do hub.
function describe(before: RoutesConfig["routes"], after: RoutesConfig["routes"]): string {
  const prev = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  const next = new Map(after.map((r) => [`${r.origin}-${r.destination}`, JSON.stringify(r)]));
  const parts: string[] = [];
  for (const [id, json] of next) parts.push(!prev.has(id) ? `+${id}` : prev.get(id) !== json ? `~${id}` : "");
  for (const id of prev.keys()) if (!next.has(id)) parts.push(`−${id}`);
  return parts.filter(Boolean).join(", ") || "padrões";
}

export async function PUT(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { config?: RoutesConfig; sha?: string; before?: RoutesConfig["routes"] } | null;
  if (!body?.config || !body.sha) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    // A página própria do Flight Tracker usa hub_url nos botões de navegação.
    const { origin } = await relyingParty();
    const config = { ...body.config, ...(origin.startsWith("http://localhost") ? {} : { hub_url: origin }) };
    const saved = await flightsApi<{ sha: string }>("config", { method: "PUT", body: { config, sha: body.sha } });
    await logEvent("routes_saved", describe(body.before ?? [], config.routes));
    return NextResponse.json({ ok: true, sha: saved.sha });
  } catch (err) {
    return fail(err);
  }
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  try {
    return NextResponse.json(await flightsApi("config"));
  } catch (err) {
    return fail(err);
  }
}
