import { internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./guard";

// Aparelhos que recebem notificações e o par de chaves VAPID. O envio em si
// fica em push.ts, que roda em Node (a biblioteca web-push precisa).

export const keys = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("pushKeys").first();
    return row ? { publicKey: row.publicKey as string, privateKey: row.privateKey as string } : null;
  },
});

// Grava o par só se ainda não existe; duas chamadas ao mesmo tempo ficam com
// o primeiro (o Convex serializa as mutações).
export const saveKeys = internalMutation({
  args: { publicKey: v.string(), privateKey: v.string() },
  handler: async (ctx, k) => {
    const row = await ctx.db.query("pushKeys").first();
    if (row) return { publicKey: row.publicKey as string, privateKey: row.privateKey as string };
    await ctx.db.insert("pushKeys", { ...k, createdAt: Date.now() });
    return k;
  },
});

export const subs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pushSubs").collect();
    return rows.map((r) => ({ endpoint: r.endpoint as string, p256dh: r.p256dh as string, auth: r.auth as string }));
  },
});

export const list = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const rows = await ctx.db.query("pushSubs").collect();
    return rows.map((r) => ({
      endpoint: r.endpoint as string,
      deviceName: r.deviceName as string,
      createdAt: r.createdAt as number,
      lastOkAt: (r.lastOkAt as number | undefined) ?? null,
    }));
  },
});

export const subscribe = mutation({
  args: { secret: v.string(), endpoint: v.string(), p256dh: v.string(), auth: v.string(), deviceName: v.string() },
  handler: async (ctx, { secret, ...sub }) => {
    assertServer(secret);
    if (!sub.endpoint.startsWith("https://")) throw new Error("Endereço de notificação inválido.");
    const row = await ctx.db.query("pushSubs").withIndex("by_endpoint", (q) => q.eq("endpoint", sub.endpoint)).unique();
    if (row) await ctx.db.patch(row._id, { p256dh: sub.p256dh, auth: sub.auth, deviceName: sub.deviceName });
    else await ctx.db.insert("pushSubs", { ...sub, createdAt: Date.now() });
  },
});

export const unsubscribe = mutation({
  args: { secret: v.string(), endpoint: v.string() },
  handler: async (ctx, { secret, endpoint }) => {
    assertServer(secret);
    const row = await ctx.db.query("pushSubs").withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint)).unique();
    if (row) await ctx.db.delete(row._id);
  },
});

// Depois de cada envio: o que entregou ganha a data; o que o serviço de push
// disse que não existe mais (404/410) sai da lista.
export const report = internalMutation({
  args: { ok: v.array(v.string()), gone: v.array(v.string()) },
  handler: async (ctx, { ok, gone }) => {
    const now = Date.now();
    for (const endpoint of [...ok, ...gone]) {
      const row = await ctx.db.query("pushSubs").withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint)).unique();
      if (!row) continue;
      if (gone.includes(endpoint)) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { lastOkAt: now });
    }
  },
});
