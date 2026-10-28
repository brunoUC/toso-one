import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { flightsApi, FlightsApiError } from "@/lib/flights-api";
import { IATA, ISO_DATE, todayISO } from "@/lib/flights-routes";
import { googleFlightsUrl } from "@/lib/gflights";

// A busca ao vivo roda no Flight Tracker (api/search.py, Python com a
// fast-flights) e leva de 5 a 30 s.
export const maxDuration = 60;

export type LiveFlight = {
  price: number;
  airline: string | null;
  stops: number | null;
  duration: string | null;
  departTime: string | null;
  arriveTime: string | null;
  arriveAhead: number;
  best: boolean;
};

// POST { origin, destination, depart, return? } → voos em executiva para as
// datas. Se o Google não responder, devolve ok: false com o link da mesma
// busca, que a página oferece no lugar.
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { origin?: string; destination?: string; depart?: string; return?: string | null } | null;
  const origin = String(b?.origin ?? "").toUpperCase();
  const destination = String(b?.destination ?? "").toUpperCase();
  const depart = String(b?.depart ?? "");
  const ret = b?.return ? String(b.return) : null;
  if (!IATA.test(origin) || !IATA.test(destination) || origin === destination)
    return NextResponse.json({ error: "Escolha origem e destino diferentes." }, { status: 400 });
  if (!ISO_DATE.test(depart) || depart <= todayISO()) return NextResponse.json({ error: "A ida precisa ser a partir de amanhã." }, { status: 400 });
  if (ret && (!ISO_DATE.test(ret) || ret <= depart)) return NextResponse.json({ error: "A volta precisa ser depois da ida." }, { status: 400 });

  const bookingUrl = googleFlightsUrl(origin, destination, depart, ret);
  try {
    const out = await flightsApi<{ flights: LiveFlight[]; googleLevel: string | null; bookingUrl: string }>("search", {
      method: "POST",
      body: { origin, destination, depart, return: ret },
    });
    return NextResponse.json({ ok: true, flights: out.flights, googleLevel: out.googleLevel, bookingUrl: out.bookingUrl || bookingUrl });
  } catch (err) {
    const msg =
      err instanceof FlightsApiError && err.status === 404
        ? "A busca ao vivo ainda não está publicada no Flight Tracker."
        : (err as Error).message;
    return NextResponse.json({ ok: false, error: msg, bookingUrl });
  }
}
