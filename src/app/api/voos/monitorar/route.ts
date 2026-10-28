import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { airportCity } from "@/lib/flight-groups";
import {
  IATA,
  ISO_DATE,
  addDaysISO,
  collectMessage,
  collectRoutes,
  daysBetween,
  errorJson,
  readRoutes,
  todayISO,
  writeRoutes,
  type RouteCfg,
} from "@/lib/flights-routes";

// POST { origin, destination, depart, return } → passa a monitorar essas
// datas. Rota nova: janela de ida de 3 dias antes a 3 depois e estadia de ±2
// dias em volta da pesquisada. Rota existente: a janela e a estadia só
// crescem para incluir as datas. Nos dois casos a coleta começa na hora,
// com o par pesquisado garantido.
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { origin?: string; destination?: string; depart?: string; return?: string } | null;
  const origin = String(b?.origin ?? "").toUpperCase();
  const destination = String(b?.destination ?? "").toUpperCase();
  const depart = String(b?.depart ?? "");
  const ret = String(b?.return ?? "");
  const tomorrow = addDaysISO(todayISO(), 1);
  if (!IATA.test(origin) || !IATA.test(destination) || origin === destination)
    return NextResponse.json({ error: "Escolha origem e destino diferentes." }, { status: 400 });
  if (!ISO_DATE.test(depart) || depart < tomorrow) return NextResponse.json({ error: "A ida precisa ser a partir de amanhã." }, { status: 400 });
  if (!ISO_DATE.test(ret) || ret <= depart) return NextResponse.json({ error: "Para monitorar, informe a volta (depois da ida)." }, { status: 400 });
  const days = daysBetween(depart, ret);
  if (days > 90) return NextResponse.json({ error: "Viagens de até 90 dias." }, { status: 400 });

  const id = `${origin}-${destination}`;
  const br = (iso: string) => iso.split("-").reverse().join("/");
  try {
    const { config, sha } = await readRoutes();
    const existing = config.routes.find((r) => r.origin === origin && r.destination === destination);
    let route: RouteCfg;
    let summary: string;
    if (existing) {
      const window: [string, string] = [existing.window[0] < depart ? existing.window[0] : depart, existing.window[1] > depart ? existing.window[1] : depart];
      const stay: [number, number] = [Math.min(existing.stay[0], days), Math.max(existing.stay[1], days)];
      // Uma janela que já tinha acabado recomeça perto das datas pesquisadas.
      if (existing.window[1] < tomorrow) window[0] = addDaysISO(depart, -3) < tomorrow ? tomorrow : addDaysISO(depart, -3);
      if (window[1] <= window[0]) window[1] = addDaysISO(window[0], 1);
      route = { ...existing, window, stay, active: true };
      const same = window.join() === existing.window.join() && stay.join() === existing.stay.join() && existing.active;
      summary = same ? `${id} já cobria essas datas.` : `${id}: ida de ${br(window[0])} a ${br(window[1])}, ${stay[0]} a ${stay[1]} dias.`;
      config.routes = config.routes.map((r) => (r === existing ? route : r));
    } else {
      const start = addDaysISO(depart, -3) < tomorrow ? tomorrow : addDaysISO(depart, -3);
      route = {
        id,
        origin,
        destination,
        city: airportCity(destination),
        window: [start, addDaysISO(depart, 3)],
        stay: [Math.max(1, days - 2), days + 2],
        active: true,
      };
      config.routes = [...config.routes, route];
      summary = `${id} criada: ida de ${br(route.window[0])} a ${br(route.window[1])}, ${route.stay[0]} a ${route.stay[1]} dias.`;
    }
    await writeRoutes(config, sha);
    await logEvent("route_monitored", `${id} ${depart} → ${ret}`);
    const collect = await collectRoutes([id], [[id, depart, ret]]);
    return NextResponse.json({ ok: true, created: !existing, route, summary, collect, collectText: collectMessage(collect) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
