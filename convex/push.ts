"use node";

import { actionGeneric as action, internalActionGeneric as internalAction, makeFunctionReference } from "convex/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import webpush from "web-push";
import { assertServer } from "./guard";

// Notificações no iPhone/Mac pelo Web Push. No iPhone só funciona com o toso
// one adicionado à Tela de Início (iOS 16.4+) e as notificações permitidas em
// Ajustes. As chaves VAPID nascem aqui na primeira vez e ficam no Convex:
// não há nada para configurar.

// O "subject" identifica quem manda; a Apple exige um mailto: ou https:.
const SUBJECT = process.env.PUSH_SUBJECT || "https://toso-one.vercel.app";

const ref = {
  keys: makeFunctionReference<"query">("pushData:keys"),
  saveKeys: makeFunctionReference<"mutation">("pushData:saveKeys"),
  subs: makeFunctionReference<"query">("pushData:subs"),
  report: makeFunctionReference<"mutation">("pushData:report"),
};

type Keys = { publicKey: string; privateKey: string };
type Ctx = GenericActionCtx<GenericDataModel>;

async function ensureKeys(ctx: Ctx): Promise<Keys> {
  const existing = (await ctx.runQuery(ref.keys, {})) as Keys | null;
  if (existing) return existing;
  const fresh = webpush.generateVAPIDKeys();
  return (await ctx.runMutation(ref.saveKeys, fresh)) as Keys;
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

async function sendAll(ctx: Ctx, msg: PushMessage) {
  const keys = await ensureKeys(ctx);
  const subs = (await ctx.runQuery(ref.subs, {})) as { endpoint: string; p256dh: string; auth: string }[];
  const ok: string[] = [];
  const gone: string[] = [];
  const failed: string[] = [];
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/financas/painel", tag: msg.tag });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 2 * 86400,
        urgency: "normal",
      });
      ok.push(s.endpoint);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.endpoint);
      else failed.push(`${status ?? "?"} ${(err as Error).message}`.slice(0, 200));
    }
  }
  await ctx.runMutation(ref.report, { ok, gone });
  return { devices: subs.length, sent: ok.length, removed: gone.length, failed };
}

export const publicKey = action({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    return (await ensureKeys(ctx)).publicKey;
  },
});

export const send = internalAction({
  args: { title: v.string(), body: v.string(), url: v.optional(v.string()), tag: v.optional(v.string()) },
  handler: (ctx, msg) => sendAll(ctx, msg),
});

// Botão "Mandar um teste" em Ajustes.
export const test = action({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    return sendAll(ctx, { title: "toso one", body: "Notificações funcionando neste aparelho.", url: "/ajustes", tag: "teste" });
  },
});
