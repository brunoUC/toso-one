import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deviceLabel, safeNext } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { lockedUntil, passwordConfigured, passwordMatches, registerFailure, resetFailures } from "@/lib/password";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!passwordConfigured()) {
    return NextResponse.json({ error: "Senha não configurada no servidor (TOSO_PASSWORD)." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { senha?: unknown; de?: unknown };
  const attempt = typeof body.senha === "string" ? body.senha : "";

  const until = await lockedUntil();
  if (until > Date.now()) {
    const min = Math.ceil((until - Date.now()) / 60_000);
    return NextResponse.json(
      { error: `Muitas tentativas. Tente de novo em ${min} min, ou entre com Face ID.` },
      { status: 429 },
    );
  }

  if (!attempt || !passwordMatches(attempt)) {
    await registerFailure();
    // Atraso fixo: deixa tentativa por força bruta lenta sem incomodar você.
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  await resetFailures();
  const device = await deviceLabel();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession("senha", device), sessionCookieOptions);
  await logEvent("login_password", device);
  return NextResponse.json({ ok: true, next: safeNext(body.de) });
}
