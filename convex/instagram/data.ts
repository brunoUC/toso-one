import { internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import type { GenericDatabaseReader, GenericDatabaseWriter, GenericDataModel } from "convex/server";
import type { GenericId, Value } from "convex/values";
import { v } from "convex/values";
import { assertServer } from "../guard";

// Leituras e gravações do Feed. A conversa com o Instagram fica em sync.ts.

type Db = GenericDatabaseReader<GenericDataModel>;
type DbW = GenericDatabaseWriter<GenericDataModel>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const KEEP_DAYS = 60; // posts mais velhos que isso saem do banco

const account = (db: Db) => db.query("igAccount").first();

const itemV = v.object({ type: v.string(), url: v.string(), video: v.optional(v.string()), w: v.number(), h: v.number() });
const postV = v.object({
  mediaId: v.string(),
  code: v.string(),
  ownerPk: v.string(),
  username: v.string(),
  fullName: v.string(),
  pic: v.string(),
  takenAt: v.number(),
  kind: v.string(),
  caption: v.string(),
  items: v.array(itemV),
  location: v.optional(v.object({ pk: v.string(), name: v.string() })),
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
});
const userV = v.object({ pk: v.string(), username: v.string(), fullName: v.string(), pic: v.string(), isPrivate: v.boolean(), isVerified: v.boolean() });

// Quanto esperar até ler a pessoa de novo, pelo quanto ela posta.
function interval(lastPostAt: number, now: number): number {
  const age = now - lastPostAt;
  if (!lastPostAt) return 3 * DAY;
  if (age < 3 * DAY) return 2 * HOUR;
  if (age < 14 * DAY) return 6 * HOUR;
  if (age < 60 * DAY) return DAY;
  return 3 * DAY;
}

// ── Para o Next (com o segredo) ─────────────────────────────────────────────

export const status = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const acc = await account(ctx.db);
    if (!acc) return null;
    const follows = await ctx.db.query("igFollowing").collect();
    const now = Date.now();
    return {
      status: acc.status as string,
      username: (acc.username as string | undefined) ?? null,
      fullName: (acc.fullName as string | undefined) ?? null,
      pic: (acc.pic as string | undefined) ?? null,
      error: (acc.error as string | undefined) ?? null,
      pendingMethod: (acc.pendingMethod as string | undefined) ?? null,
      connectedAt: (acc.connectedAt as number | undefined) ?? null,
      following: follows.length,
      read: follows.filter((f) => (f.checkedAt as number) > 0).length,
      followingSyncedAt: (acc.followingSyncedAt as number | undefined) ?? null,
      lastTickAt: (acc.lastTickAt as number | undefined) ?? null,
      running: ((acc.runningUntil as number | undefined) ?? 0) > now,
      backoffUntil: ((acc.backoffUntil as number | undefined) ?? 0) > now ? (acc.backoffUntil as number) : null,
    };
  },
});

// Feed: mais novos primeiro, a partir de `before` (ms). Reels só se pedir.
export const feed = query({
  args: { secret: v.string(), before: v.optional(v.number()), limit: v.number(), reels: v.boolean() },
  handler: async (ctx, { secret, before, limit, reels }) => {
    assertServer(secret);
    const out: Record<string, unknown>[] = [];
    const q = ctx.db
      .query("igPosts")
      .withIndex("by_takenAt", (r) => (before ? r.lt("takenAt", before) : r))
      .order("desc");
    let scanned = 0;
    for await (const p of q) {
      if (++scanned > 600) break;
      if (!reels && p.kind === "reel") continue;
      const { _id, _creationTime, fetchedAt, ...post } = p;
      void _id;
      void _creationTime;
      void fetchedAt;
      out.push(post);
      if (out.length >= Math.min(limit, 60)) break;
    }
    const last = out[out.length - 1] as { takenAt: number } | undefined;
    return { posts: out, next: out.length >= Math.min(limit, 60) && last ? last.takenAt : null };
  },
});

export const disconnect = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    for (const t of ["igAccount", "igFollowing", "igPosts"] as const) {
      // Em levas, para não estourar o limite de uma mutação.
      const rows = await ctx.db.query(t).take(2000);
      for (const r of rows) await ctx.db.delete(r._id);
    }
  },
});

// ── Internas (sync.ts) ─────────────────────────────────────────────────────

export const state = internalQuery({
  args: {},
  handler: async (ctx) => {
    const acc = await account(ctx.db);
    if (!acc) return null;
    return {
      status: acc.status as string,
      jar: (acc.jar as string | undefined) ?? null,
      pendingJar: (acc.pendingJar as string | undefined) ?? null,
      pendingIdentifier: (acc.pendingIdentifier as string | undefined) ?? null,
      pendingUsername: (acc.pendingUsername as string | undefined) ?? null,
      followingSyncedAt: (acc.followingSyncedAt as number | undefined) ?? 0,
      lastTickAt: (acc.lastTickAt as number | undefined) ?? 0,
      runningUntil: (acc.runningUntil as number | undefined) ?? 0,
      backoffUntil: (acc.backoffUntil as number | undefined) ?? 0,
    };
  },
});

async function upsertAccount(db: DbW, patch: Record<string, Value | undefined>) {
  const acc = await db.query("igAccount").first();
  if (acc) await db.patch(acc._id as GenericId<string>, patch);
  else await db.insert("igAccount", { status: "expired", ...patch });
}

export const saveConnected = internalMutation({
  args: { jar: v.string(), user: userV },
  handler: async (ctx, { jar, user }) => {
    const acc = await ctx.db.query("igAccount").first();
    // Outra conta: começa do zero.
    if (acc && acc.pk && acc.pk !== user.pk) {
      for (const t of ["igFollowing", "igPosts"] as const) {
        for (const r of await ctx.db.query(t).take(4000)) await ctx.db.delete(r._id);
      }
    }
    await upsertAccount(ctx.db, {
      pk: user.pk,
      username: user.username,
      fullName: user.fullName,
      pic: user.pic,
      jar,
      status: "ok",
      error: undefined,
      connectedAt: Date.now(),
      pendingJar: undefined,
      pendingIdentifier: undefined,
      pendingUsername: undefined,
      pendingMethod: undefined,
      backoffUntil: undefined,
      backoffLevel: undefined,
      runningUntil: undefined,
      ...(acc && acc.pk && acc.pk !== user.pk ? { followingSyncedAt: undefined } : {}),
    });
  },
});

export const savePending = internalMutation({
  args: { jar: v.string(), identifier: v.string(), username: v.string(), method: v.string() },
  handler: async (ctx, a) => {
    const acc = await ctx.db.query("igAccount").first();
    await upsertAccount(ctx.db, {
      // Não derruba uma sessão que ainda funciona enquanto espera o código.
      status: acc?.status === "ok" ? "ok" : "pending2fa",
      pendingJar: a.jar,
      pendingIdentifier: a.identifier,
      pendingUsername: a.username,
      pendingMethod: a.method,
    });
  },
});

export const setJar = internalMutation({
  args: { jar: v.string() },
  handler: async (ctx, { jar }) => upsertAccount(ctx.db, { jar }),
});

export const setStatus = internalMutation({
  args: { status: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { status, error }) => upsertAccount(ctx.db, { status, error, runningUntil: undefined }),
});

// Trava simples: uma leitura de cada vez. Devolve false se já tem outra.
export const claim = internalMutation({
  args: { minGapMs: v.number() },
  handler: async (ctx, { minGapMs }) => {
    const acc = await ctx.db.query("igAccount").first();
    const now = Date.now();
    if (!acc || acc.status !== "ok" || !acc.jar) return false;
    if (((acc.runningUntil as number | undefined) ?? 0) > now) return false;
    if (((acc.backoffUntil as number | undefined) ?? 0) > now) return false;
    if (now - ((acc.lastTickAt as number | undefined) ?? 0) < minGapMs) return false;
    await ctx.db.patch(acc._id, { runningUntil: now + 8 * 60_000, lastTickAt: now });
    return true;
  },
});

export const release = internalMutation({
  args: { rateLimited: v.boolean() },
  handler: async (ctx, { rateLimited }) => {
    const acc = await ctx.db.query("igAccount").first();
    if (!acc) return;
    const level = (acc.backoffLevel as number | undefined) ?? 0;
    await ctx.db.patch(acc._id, {
      runningUntil: undefined,
      // Pausa de 1h, 2h, 4h, até 8h quando o Instagram pede calma.
      ...(rateLimited ? { backoffUntil: Date.now() + Math.min(8, 2 ** level) * HOUR, backoffLevel: level + 1 } : { backoffLevel: 0 }),
    });
  },
});

export const saveFollowing = internalMutation({
  args: { users: v.array(userV), startedAt: v.number() },
  handler: async (ctx, { users, startedAt }) => {
    const now = Date.now();
    for (const u of users) {
      const row = await ctx.db.query("igFollowing").withIndex("by_pk", (q) => q.eq("pk", u.pk)).unique();
      if (row) await ctx.db.patch(row._id, { ...u, seenAt: startedAt });
      // Gente nova entra na frente da fila.
      else await ctx.db.insert("igFollowing", { ...u, checkedAt: 0, lastPostAt: 0, nextAt: now - 1, seenAt: startedAt });
    }
  },
});

// Depois de ler a lista inteira: quem não apareceu foi deixado de seguir.
export const finishFollowing = internalMutation({
  args: { startedAt: v.number() },
  handler: async (ctx, { startedAt }) => {
    const rows = await ctx.db.query("igFollowing").collect();
    for (const r of rows) {
      if ((r.seenAt as number) >= startedAt) continue;
      for (const p of await ctx.db.query("igPosts").withIndex("by_owner", (q) => q.eq("ownerPk", r.pk as string)).collect()) await ctx.db.delete(p._id);
      await ctx.db.delete(r._id);
    }
    await upsertAccount(ctx.db, { followingSyncedAt: Date.now() });
  },
});

// Os próximos a ler: os mais atrasados. `dueOnly` = só os que já venceram.
export const nextBatch = internalQuery({
  args: { limit: v.number(), dueOnly: v.boolean() },
  handler: async (ctx, { limit, dueOnly }) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("igFollowing")
      .withIndex("by_nextAt", (q) => (dueOnly ? q.lte("nextAt", now) : q))
      .order("asc")
      .take(limit);
    return rows.map((r) => ({ pk: r.pk as string, username: r.username as string, never: (r.checkedAt as number) === 0 }));
  },
});

export const savePosts = internalMutation({
  args: { pk: v.string(), posts: v.array(postV), retryInMs: v.optional(v.number()) },
  handler: async (ctx, { pk, posts, retryInMs }) => {
    const now = Date.now();
    const cutoff = now - KEEP_DAYS * DAY;
    const row = await ctx.db.query("igFollowing").withIndex("by_pk", (q) => q.eq("pk", pk)).unique();
    if (!row) return;
    if (retryInMs) {
      // Não deu para ler: tenta de novo mais tarde, sem mexer nos posts.
      await ctx.db.patch(row._id, { checkedAt: now, nextAt: now + retryInMs });
      return;
    }
    let lastPostAt = row.lastPostAt as number;
    const seen = new Set<string>();
    for (const p of posts) {
      lastPostAt = Math.max(lastPostAt, p.takenAt);
      if (p.takenAt < cutoff) continue; // fixados antigos não entram
      seen.add(p.mediaId);
      const old = await ctx.db.query("igPosts").withIndex("by_mediaId", (q) => q.eq("mediaId", p.mediaId)).unique();
      // A foto do post tem link com validade: regrava sempre que lê de novo.
      if (old) await ctx.db.patch(old._id, { ...p, fetchedAt: now });
      else await ctx.db.insert("igPosts", { ...p, fetchedAt: now });
    }
    // Posts apagados pela pessoa: os que estavam no intervalo lido e sumiram.
    // A página vem com os fixados primeiro e depois por data, então o último
    // item é o mais velho da parte cronológica.
    const oldest = posts.length ? posts[posts.length - 1].takenAt : now;
    for (const p of await ctx.db.query("igPosts").withIndex("by_owner", (q: any) => q.eq("ownerPk", pk).gte("takenAt", oldest)).collect()) {
      if (!seen.has(p.mediaId as string) && posts.length > 0) await ctx.db.delete(p._id);
    }
    // Faxina: posts velhos dessa pessoa.
    for (const p of await ctx.db.query("igPosts").withIndex("by_owner", (q: any) => q.eq("ownerPk", pk).lt("takenAt", cutoff)).collect()) await ctx.db.delete(p._id);
    const jitter = Math.floor(Math.random() * 20 * 60_000);
    await ctx.db.patch(row._id, { checkedAt: now, lastPostAt, nextAt: now + interval(lastPostAt, now) + jitter });
  },
});
