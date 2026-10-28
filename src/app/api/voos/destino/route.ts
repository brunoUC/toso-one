import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { IATA, ISO_DATE, collectMessage, collectRoutes, errorJson, readRoutes, writeRoutes } from "@/lib/flights-routes";

// PATCH { destinations: ["LIS"], window: [ida mín, ida máx], stay: [mín, máx] }
// Ajuste de datas direto na página de Voos: vale para todas as origens do
// destino e dispara a coleta dessas rotas na hora.
export async function PATCH(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { destinations?: string[]; window?: string[]; stay?: number[] } | null;
  const dests = body?.destinations;
  const win = body?.window;
  const stay = body?.stay;
  if (!Array.isArray(dests) || dests.length === 0 || !dests.every((d) => IATA.test(d)))
    return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
  if (!Array.isArray(win) || win.length !== 2 || !win.every((d) => ISO_DATE.test(d)) || win[1] <= win[0])
    return NextResponse.json({ error: "Janela de ida: a data final precisa ser depois da inicial." }, { status: 400 });
  if (!Array.isArray(stay) || stay.length !== 2 || !stay.every((n) => Number.isInteger(n) && n >= 1 && n <= 90) || stay[0] > stay[1])
    return NextResponse.json({ error: "Dias de viagem: de 1 a 90, mínimo até o máximo." }, { status: 400 });

  try {
    const { config, sha } = await readRoutes();
    const ids: string[] = [];
    config.routes = config.routes.map((r) => {
      if (!dests.includes(r.destination)) return r;
      if (r.active) ids.push(`${r.origin}-${r.destination}`);
      return { ...r, window: [win[0], win[1]], stay: [stay[0], stay[1]] };
    });
    if (ids.length === 0 && !config.routes.some((r) => dests.includes(r.destination)))
      return NextResponse.json({ error: "Nenhuma rota para esse destino." }, { status: 404 });
    await writeRoutes(config, sha);
    await logEvent("routes_saved", `datas de ${dests.join("/")}: ${win[0]} a ${win[1]}, ${stay[0]}–${stay[1]} dias`);
    const collect = await collectRoutes(ids);
    return NextResponse.json({ ok: true, routes: ids, collect, collectText: collectMessage(collect) });
  } catch (err) {
    const { body: b, status } = errorJson(err);
    // A validação do Flight Tracker devolve erros por rota; o primeiro basta.
    const routeErrors = (b.details as { routes?: Record<string, string>[] } | undefined)?.routes;
    const first = routeErrors?.flatMap((e) => Object.values(e ?? {}))[0];
    return NextResponse.json({ error: first ? `${b.error} ${first}.` : b.error }, { status });
  }
}
