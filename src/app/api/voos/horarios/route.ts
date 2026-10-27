import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { FlightsApiError, flightsApi } from "@/lib/flights-api";

// Horários da coleta automática (Brasília), gravados no monitor.yml.
export async function PUT(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { times?: string[]; sha?: string } | null;
  if (!body?.sha || !Array.isArray(body.times)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    return NextResponse.json(await flightsApi("schedule", { method: "PUT", body: { times: body.times, sha: body.sha } }));
  } catch (err) {
    const e = err instanceof FlightsApiError ? err : new FlightsApiError((err as Error).message, 500);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
