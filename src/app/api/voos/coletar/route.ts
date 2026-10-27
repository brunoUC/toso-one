import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { FlightsApiError, flightsApi, type Run } from "@/lib/flights-api";

// POST dispara uma coleta agora; GET lista as últimas execuções.
async function guard() {
  return (await getSession()) ? null : NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
}

function fail(err: unknown) {
  const e = err instanceof FlightsApiError ? err : new FlightsApiError((err as Error).message, 500);
  return NextResponse.json({ error: e.message }, { status: e.status });
}

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await flightsApi("run", { method: "POST" });
    await logEvent("collect_dispatched", "Flight Tracker");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    return NextResponse.json(await flightsApi<{ runs: Run[] }>("run"));
  } catch (err) {
    return fail(err);
  }
}
