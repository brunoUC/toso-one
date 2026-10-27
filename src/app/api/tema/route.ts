import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

export async function POST(request: Request) {
  const { tema } = (await request.json().catch(() => ({}))) as { tema?: unknown };
  if (!isTheme(tema)) return NextResponse.json({ error: "Tema inválido." }, { status: 400 });
  const jar = await cookies();
  jar.set(THEME_COOKIE, tema, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return NextResponse.json({ ok: true });
}
