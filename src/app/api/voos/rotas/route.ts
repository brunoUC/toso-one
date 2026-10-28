import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import type { RoutesConfig } from "@/lib/flights-api";
import { changedRouteIds, collectMessage, collectRoutes, errorJson, readRoutes, writeRoutes } from "@/lib/flights-routes";

function fail(err: unknown) {
  const { body, status } = errorJson(err);
  return NextResponse.json(body, { status });
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

// Grava e já dispara a coleta das rotas novas ou com datas alteradas, para o
// histórico não esperar a próxima coleta agendada.
export async function PUT(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { config?: RoutesConfig; sha?: string; before?: RoutesConfig["routes"] } | null;
  if (!body?.config || !body.sha) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    const sha = await writeRoutes(body.config, body.sha);
    await logEvent("routes_saved", describe(body.before ?? [], body.config.routes));
    const collect = await collectRoutes(changedRouteIds(body.before ?? [], body.config.routes));
    return NextResponse.json({ ok: true, sha, collect, collectText: collectMessage(collect) });
  } catch (err) {
    return fail(err);
  }
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  try {
    return NextResponse.json(await readRoutes());
  } catch (err) {
    return fail(err);
  }
}
