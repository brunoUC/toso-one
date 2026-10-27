import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, serverSecret } from "@/lib/convex";
import { passkeysUnavailable } from "@/lib/webauthn";

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const unavailable = passkeysUnavailable();
  if (unavailable) return unavailable;

  const { credentialId } = (await request.json().catch(() => ({}))) as { credentialId?: unknown };
  if (typeof credentialId !== "string") return NextResponse.json({ error: "Credencial inválida." }, { status: 400 });
  const removed = await convex().mutation(api.passkeys.remove, { secret: serverSecret(), credentialId });
  return NextResponse.json({ ok: removed });
}
