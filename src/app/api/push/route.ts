import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";

// Notificações (Web Push): a chave pública para o navegador assinar, e
// cadastrar, remover e testar aparelhos. Tudo com sessão; o Convex guarda.

type Body =
  | { action: "subscribe"; endpoint: string; p256dh: string; auth: string; deviceName: string }
  | { action: "unsubscribe"; endpoint: string }
  | { action: "test" };

const str = (v: unknown, max = 1000) => (typeof v === "string" ? v.slice(0, max) : "");

async function guard() {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  return null;
}

const fail = (err: unknown) =>
  NextResponse.json({ error: (err as Error).message.replace(/^.*Uncaught Error: /s, "").split("\n")[0] || "Não deu certo." }, { status: 400 });

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const secret = serverSecret();
    const [publicKey, devices] = await Promise.all([convex().action(api.push.publicKey, { secret }), convex().query(api.pushData.list, { secret })]);
    return NextResponse.json({ publicKey, devices });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as Body | null;
  const secret = serverSecret();
  try {
    switch (b?.action) {
      case "subscribe":
        await convex().mutation(api.pushData.subscribe, {
          secret,
          endpoint: str(b.endpoint),
          p256dh: str(b.p256dh, 200),
          auth: str(b.auth, 100),
          deviceName: str(b.deviceName, 60) || "Aparelho",
        });
        return NextResponse.json({ ok: true });
      case "unsubscribe":
        await convex().mutation(api.pushData.unsubscribe, { secret, endpoint: str(b.endpoint) });
        return NextResponse.json({ ok: true });
      case "test":
        return NextResponse.json(await convex().action(api.push.test, { secret }));
      default:
        return NextResponse.json({ error: "Pedido desconhecido." }, { status: 400 });
    }
  } catch (err) {
    return fail(err);
  }
}
