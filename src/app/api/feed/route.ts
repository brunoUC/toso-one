import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";

// Só apaga a sessão do Instagram guardada pelo Feed antigo (e os posts que
// ele leu). O Feed de agora é o próprio instagram.com.
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  try {
    let more = true;
    for (let i = 0; i < 20 && more; i++) {
      ({ more } = (await convex().mutation(api.instagram.data.disconnect, { secret: serverSecret() })) as { more: boolean });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.split("\n")[0] }, { status: 500 });
  }
}
