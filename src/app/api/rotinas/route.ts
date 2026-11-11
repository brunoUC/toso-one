import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";

// Rotinas do feed (Ajustes → Rotinas). Confere a sessão e repassa ao Convex.
type Body =
  | { action: "save"; id?: string; title: string; days: number[]; time?: string; note?: string; skipHolidays: boolean }
  | { action: "remove"; id: string };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  const b = (await request.json().catch(() => null)) as Body | null;
  const secret = serverSecret();
  try {
    if (b?.action === "save") {
      const id = await convex().mutation(api.routines.save, {
        secret,
        id: b.id ? str(b.id, 64) : undefined,
        title: str(b.title, 80),
        days: Array.isArray(b.days) ? b.days.filter((d) => typeof d === "number").slice(0, 7) : [],
        time: b.time ? str(b.time, 5) : undefined,
        note: b.note ? str(b.note, 200) : undefined,
        skipHolidays: Boolean(b.skipHolidays),
      });
      return NextResponse.json({ id });
    }
    if (b?.action === "remove") {
      await convex().mutation(api.routines.remove, { secret, id: str(b.id, 64) });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (err) {
    // O Convex embrulha a mensagem ("Uncaught Error: ..."): mostra só o fim.
    const msg = (err as Error).message.match(/Error: ([^\n]+)/)?.[1] ?? "Não foi possível salvar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
