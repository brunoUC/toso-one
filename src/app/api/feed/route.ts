import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";
import { feedPage, feedStatus } from "@/lib/instagram";

// Feed: confere a sessão do toso one e repassa ao Convex, que é quem fala
// com o Instagram.

type Body =
  | { action: "login"; username: string; password: string }
  | { action: "code"; code: string }
  | { action: "sessionid"; sessionid: string }
  | { action: "like"; mediaId: string; on: boolean; code?: string }
  | { action: "comment"; mediaId: string; text: string; replyTo?: string; code?: string }
  | { action: "likeComment"; commentPk: string; on: boolean }
  | { action: "refresh" }
  | { action: "disconnect" };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

async function guard(): Promise<NextResponse | null> {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  return null;
}

const clean = (err: unknown) => (err as Error).message.replace(/^.*Uncaught Error: /s, "").split("\n")[0];

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const url = new URL(request.url);
  try {
    if (url.searchParams.has("status")) return NextResponse.json(await feedStatus());
    // Comentários de um post e respostas de um comentário.
    const media = url.searchParams.get("comentarios");
    if (media) {
      const replies = url.searchParams.get("respostas");
      if (replies) {
        return NextResponse.json(await convex().action(api.instagram.sync.replies, { secret: serverSecret(), mediaId: str(media, 40), commentPk: str(replies, 40) }));
      }
      const cursor = url.searchParams.get("cursor");
      return NextResponse.json(
        await convex().action(api.instagram.sync.comments, { secret: serverSecret(), mediaId: str(media, 40), ...(cursor ? { cursor: str(cursor, 400) } : {}) }),
      );
    }
    // Mais posts de um perfil (página de perfil).
    const pk = url.searchParams.get("pk");
    const max = url.searchParams.get("max");
    if (pk && max) {
      return NextResponse.json(await convex().action(api.instagram.sync.morePosts, { secret: serverSecret(), pk: str(pk, 40), maxId: str(max, 200) }));
    }
    const before = Number(url.searchParams.get("antes")) || undefined;
    return NextResponse.json(await feedPage(before, url.searchParams.get("reels") === "1"));
  } catch (err) {
    return NextResponse.json({ error: clean(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as Body | null;
  const secret = serverSecret();
  const c = convex();
  try {
    switch (b?.action) {
      case "login":
        return NextResponse.json(await c.action(api.instagram.sync.login, { secret, username: str(b.username, 60), password: str(b.password, 200) }));
      case "code":
        return NextResponse.json(await c.action(api.instagram.sync.verifyCode, { secret, code: str(b.code, 12) }));
      case "sessionid":
        return NextResponse.json(await c.action(api.instagram.sync.connectSession, { secret, sessionid: str(b.sessionid, 400) }));
      case "like":
        return NextResponse.json(
          await c.action(api.instagram.sync.like, { secret, mediaId: str(b.mediaId, 40), on: Boolean(b.on), ...(b.code ? { code: str(b.code, 40) } : {}) }),
        );
      case "comment":
        return NextResponse.json(
          await c.action(api.instagram.sync.comment, {
            secret,
            mediaId: str(b.mediaId, 40),
            text: str(b.text, 2200),
            ...(b.replyTo ? { replyTo: str(b.replyTo, 40) } : {}),
            ...(b.code ? { code: str(b.code, 40) } : {}),
          }),
        );
      case "likeComment":
        return NextResponse.json(await c.action(api.instagram.sync.likeComment, { secret, commentPk: str(b.commentPk, 40), on: Boolean(b.on) }));
      case "refresh":
        await c.action(api.instagram.sync.refreshNow, { secret });
        return NextResponse.json({ ok: true });
      case "disconnect":
        await c.mutation(api.instagram.data.disconnect, { secret });
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Pedido desconhecido." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: clean(err) }, { status: 500 });
  }
}
