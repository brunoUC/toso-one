import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";
import { defaultPlace, lastKnownPlace } from "@/lib/place";
import { getFeed, morningDigest } from "@/lib/semana";

// Resumo da manhã por push: o cron da Vercel (vercel.json) chama às 07:07
// com "Authorization: Bearer $CRON_SECRET". Manda o dia de hoje do feed
// (feriado, rotinas, agenda, contas e chuva, no último lugar conhecido) para os aparelhos com
// notificações ativas. Dia vazio não manda nada.

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (expected.length < 16) return false;
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  // Sem navegador aqui: vale o último lugar em que ele abriu o toso one.
  const feed = await getFeed({ place: (await lastKnownPlace()) ?? defaultPlace() });
  const digest = morningDigest(feed);
  if (!digest) return NextResponse.json({ sent: false, reason: "dia vazio" });
  const result = await convex().action(api.push.notify, { secret: serverSecret(), ...digest, url: "/", tag: `manha-${feed.today}` });
  return NextResponse.json({ sent: true, digest, result });
}
