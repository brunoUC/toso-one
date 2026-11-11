import { actionGeneric as action, internalActionGeneric as internalAction, makeFunctionReference } from "convex/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "../guard";
import * as ig from "./client";
import { open, seal } from "./vault";

// Conversa com o Instagram. O feed é montado aos poucos, num ritmo de gente:
// a cada 10 minutos (cron) lê os posts de ~12 pessoas, priorizando quem
// posta mais. Assim o feed fica em dia sem disparar o alarme de robô do
// Instagram, que derruba a sessão de quem pede demais.

const BATCH = 12; // pessoas por rodada
const FIRST_BATCH = 20; // enquanto ainda tem gente nunca lida
const FOLLOWING_EVERY = 24 * 3_600_000; // relê a lista de quem segue 1×/dia

const ref = {
  state: makeFunctionReference<"query">("instagram/data:state"),
  saveConnected: makeFunctionReference<"mutation">("instagram/data:saveConnected"),
  savePending: makeFunctionReference<"mutation">("instagram/data:savePending"),
  setJar: makeFunctionReference<"mutation">("instagram/data:setJar"),
  setStatus: makeFunctionReference<"mutation">("instagram/data:setStatus"),
  claim: makeFunctionReference<"mutation">("instagram/data:claim"),
  release: makeFunctionReference<"mutation">("instagram/data:release"),
  saveFollowing: makeFunctionReference<"mutation">("instagram/data:saveFollowing"),
  finishFollowing: makeFunctionReference<"mutation">("instagram/data:finishFollowing"),
  nextBatch: makeFunctionReference<"query">("instagram/data:nextBatch"),
  savePosts: makeFunctionReference<"mutation">("instagram/data:savePosts"),
  tick: makeFunctionReference<"action">("instagram/sync:tick"),
  touchPost: makeFunctionReference<"mutation">("instagram/data:touchPost"),
};

type Ctx = GenericActionCtx<GenericDataModel>;
type State = {
  status: string;
  jar: string | null;
  pendingJar: string | null;
  pendingIdentifier: string | null;
  pendingUsername: string | null;
  followingSyncedAt: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(2500 + Math.random() * 3500); // 2,5 a 6 s entre pedidos

// Hora de Brasília (UTC−3, sem horário de verão desde 2019).
const brHour = () => (new Date().getUTCHours() + 21) % 24;

async function session(ctx: Ctx): Promise<{ jar: ig.Jar; snapshot: string } | null> {
  const st = (await ctx.runQuery(ref.state, {})) as State | null;
  if (!st?.jar || st.status !== "ok") return null;
  const jar = await open<ig.Jar>(st.jar);
  return { jar, snapshot: JSON.stringify(jar) };
}

// O Instagram renova cookies nas respostas; guarda a versão nova.
async function persist(ctx: Ctx, jar: ig.Jar, snapshot: string) {
  if (JSON.stringify(jar) !== snapshot) await ctx.runMutation(ref.setJar, { jar: await seal(jar) });
}

async function fail(ctx: Ctx, err: unknown, jar?: ig.Jar): Promise<string> {
  const e = err as Error;
  console.error("Feed/Instagram:", e.message);
  if (e instanceof ig.IgError && e.kind === "checkpoint") {
    await ctx.runMutation(ref.setStatus, { status: "checkpoint", error: e.message });
  }
  if (e instanceof ig.IgError && e.kind === "login") {
    // Confere antes de derrubar: se a conta ainda responde, foi só aquele pedido.
    if (jar && (await ig.stillLoggedIn(jar))) return e.message.replace("A sessão do Instagram expirou. Conecte de novo", "O Instagram recusou este pedido");
    await ctx.runMutation(ref.setStatus, { status: "expired", error: e.message });
  }
  return e.message;
}

// ── Leitura periódica ──────────────────────────────────────────────────────

async function runTick(ctx: Ctx, manual: boolean) {
  if (!manual && brHour() >= 2 && brHour() < 7) return; // de madrugada, dorme
  const claimed = (await ctx.runMutation(ref.claim, { minGapMs: manual ? 60_000 : 4 * 60_000 })) as boolean;
  if (!claimed) return;
  let rateLimited = false;
  try {
    const s = await session(ctx);
    if (!s) return;
    const { jar, snapshot } = s;
    try {
      const st = (await ctx.runQuery(ref.state, {})) as State;
      if (Date.now() - st.followingSyncedAt > FOLLOWING_EVERY) {
        const startedAt = Date.now();
        let next: string | undefined;
        for (let page = 0; page < 80; page++) {
          const r = await ig.followingPage(jar, next);
          await ctx.runMutation(ref.saveFollowing, { users: r.users, startedAt });
          next = r.next;
          if (!next) break;
          await pause();
        }
        // Só apaga quem sumiu se a lista veio inteira.
        if (!next) await ctx.runMutation(ref.finishFollowing, { startedAt });
        await pause();
      }

      const probe = (await ctx.runQuery(ref.nextBatch, { limit: 1, dueOnly: false })) as { never: boolean }[];
      const size = probe[0]?.never ? FIRST_BATCH : BATCH;
      const batch = (await ctx.runQuery(ref.nextBatch, { limit: size, dueOnly: !manual })) as { pk: string; username: string }[];
      let odd = 0;
      for (const [i, who] of batch.entries()) {
        if (i > 0) await pause();
        try {
          const { posts } = await ig.userFeed(jar, who.pk);
          await ctx.runMutation(ref.savePosts, { pk: who.pk, posts });
          odd = 0;
        } catch (err) {
          const kind = err instanceof ig.IgError ? err.kind : "other";
          if (kind === "notfound") {
            // Perfil apagado ou que bloqueou: tenta de novo daqui a uma semana.
            await ctx.runMutation(ref.savePosts, { pk: who.pk, posts: [], retryInMs: 7 * 24 * 3_600_000 });
            continue;
          }
          // Erro estranho num perfil só (inclusive "deslogado" com a conta
          // ainda funcionando): pula ele por um dia. Vários seguidos =
          // problema do lado de lá; para a rodada e tenta na próxima.
          const odd1 = kind === "other" || (kind === "login" && (await ig.stillLoggedIn(jar)));
          if (odd1 && ++odd < 3) {
            await ctx.runMutation(ref.savePosts, { pk: who.pk, posts: [], retryInMs: 24 * 3_600_000 });
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      rateLimited = err instanceof ig.IgError && err.kind === "rate";
      await fail(ctx, err, jar);
    } finally {
      await persist(ctx, jar, snapshot);
    }
  } finally {
    await ctx.runMutation(ref.release, { rateLimited });
  }
}

export const tick = internalAction({
  args: { manual: v.optional(v.boolean()) },
  handler: async (ctx, { manual }) => runTick(ctx, Boolean(manual)),
});

// Botão "Atualizar": roda uma leitura agora, sem esperar o cron.
export const refreshNow = action({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    await ctx.scheduler.runAfter(0, ref.tick, { manual: true });
  },
});

// ── Conectar ───────────────────────────────────────────────────────────────

async function connected(ctx: Ctx, jar: ig.Jar, usernameHint?: string) {
  const user = await ig.me(jar, usernameHint);
  await ctx.runMutation(ref.saveConnected, { jar: await seal(jar), user });
  await ctx.scheduler.runAfter(0, ref.tick, { manual: true });
  return { ok: true as const, username: user.username };
}

type ConnectResult = { ok: true; username: string } | { ok: false; twoFactor?: boolean; method?: string; error?: string };

async function outcome(ctx: Ctx, r: ig.LoginResult, username?: string): Promise<ConnectResult> {
  if (r.kind === "ok") return connected(ctx, r.jar, username);
  if (r.kind === "twoFactor") {
    await ctx.runMutation(ref.savePending, { jar: await seal(r.jar), identifier: r.identifier, username: r.username, method: r.method });
    return { ok: false, twoFactor: true, method: r.method };
  }
  return { ok: false, error: r.message };
}

export const login = action({
  args: { secret: v.string(), username: v.string(), password: v.string() },
  handler: async (ctx, { secret, username, password }): Promise<ConnectResult> => {
    assertServer(secret);
    try {
      const user = username.trim().replace(/^@/, "").toLowerCase();
      return await outcome(ctx, await ig.login(user, password), user);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
});

export const verifyCode = action({
  args: { secret: v.string(), code: v.string() },
  handler: async (ctx, { secret, code }): Promise<ConnectResult> => {
    assertServer(secret);
    const st = (await ctx.runQuery(ref.state, {})) as State | null;
    if (!st?.pendingJar || !st.pendingIdentifier || !st.pendingUsername) return { ok: false, error: "Comece a entrada de novo." };
    try {
      return await outcome(ctx, await ig.twoFactor(await open<ig.Jar>(st.pendingJar), st.pendingUsername, st.pendingIdentifier, code), st.pendingUsername);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
});

// Plano B: colar o cookie "sessionid" de um navegador onde já está logado.
export const connectSession = action({
  args: { secret: v.string(), sessionid: v.string() },
  handler: async (ctx, { secret, sessionid }): Promise<ConnectResult> => {
    assertServer(secret);
    try {
      return await connected(ctx, ig.jarFromSessionId(sessionid));
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
});

// ── Busca e páginas sob demanda ────────────────────────────────────────────

async function live<T>(ctx: Ctx, fn: (jar: ig.Jar) => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string; kind?: string }> {
  const s = await session(ctx);
  if (!s) return { ok: false, error: "Conecte sua conta do Instagram primeiro.", kind: "login" };
  try {
    return { ok: true, data: await fn(s.jar) };
  } catch (err) {
    return { ok: false, error: await fail(ctx, err, s.jar), ...(err instanceof ig.IgError ? { kind: err.kind } : {}) };
  } finally {
    await persist(ctx, s.jar, s.snapshot);
  }
}

export const search = action({
  args: { secret: v.string(), query: v.string() },
  handler: async (ctx, { secret, query }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.search(jar, query.slice(0, 100)));
  },
});

export const profile = action({
  args: { secret: v.string(), username: v.string(), maxId: v.optional(v.string()) },
  handler: async (ctx, { secret, username, maxId }) => {
    assertServer(secret);
    return live(ctx, async (jar) => {
      const p = await ig.profile(jar, username);
      if (p.isPrivate && !p.followedByMe) return { profile: p, posts: [] as ig.Post[], next: undefined };
      const { posts, next } = await ig.userFeed(jar, p.pk, maxId, 12);
      return { profile: p, posts, next };
    });
  },
});

export const morePosts = action({
  args: { secret: v.string(), pk: v.string(), maxId: v.string() },
  handler: async (ctx, { secret, pk, maxId }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.userFeed(jar, pk, maxId, 12));
  },
});

export const place = action({
  args: { secret: v.string(), pk: v.string() },
  handler: async (ctx, { secret, pk }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.place(jar, pk));
  },
});

export const tag = action({
  args: { secret: v.string(), name: v.string() },
  handler: async (ctx, { secret, name }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.tag(jar, name));
  },
});

// ── Curtir e comentar ──────────────────────────────────────────────────────

export const like = action({
  args: { secret: v.string(), mediaId: v.string(), on: v.boolean(), code: v.optional(v.string()) },
  handler: async (ctx, { secret, mediaId, on, code }) => {
    assertServer(secret);
    const r = await live(ctx, (jar) => ig.like(jar, mediaId, on, code));
    if (r.ok) await ctx.runMutation(ref.touchPost, { mediaId, liked: on });
    return r;
  },
});

export const comments = action({
  args: { secret: v.string(), mediaId: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, { secret, mediaId, cursor }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.comments(jar, mediaId, cursor));
  },
});

export const replies = action({
  args: { secret: v.string(), mediaId: v.string(), commentPk: v.string() },
  handler: async (ctx, { secret, mediaId, commentPk }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.replies(jar, mediaId, commentPk));
  },
});

export const comment = action({
  args: { secret: v.string(), mediaId: v.string(), text: v.string(), replyTo: v.optional(v.string()), code: v.optional(v.string()) },
  handler: async (ctx, { secret, mediaId, text, replyTo, code }) => {
    assertServer(secret);
    const clean = text.trim().slice(0, 2200);
    if (!clean) return { ok: false as const, error: "Comentário vazio." };
    const r = await live(ctx, (jar) => ig.addComment(jar, mediaId, clean, replyTo, code));
    if (r.ok) await ctx.runMutation(ref.touchPost, { mediaId, commentDelta: 1 });
    return r;
  },
});

export const likeComment = action({
  args: { secret: v.string(), commentPk: v.string(), on: v.boolean() },
  handler: async (ctx, { secret, commentPk, on }) => {
    assertServer(secret);
    return live(ctx, (jar) => ig.likeComment(jar, commentPk, on));
  },
});
