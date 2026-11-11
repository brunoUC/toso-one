import "server-only";
import { api, convex, convexConfigured, serverSecret } from "./convex";
import type { FeedPost, FeedProfile, FeedSearch } from "./feed";

// O Next só repassa ao Convex: a sessão do Instagram mora lá (cifrada) e é
// de lá que saem todos os pedidos ao Instagram.

export type FeedStatus = {
  status: "ok" | "expired" | "checkpoint" | "pending2fa" | string;
  username: string | null;
  fullName: string | null;
  pic: string | null;
  error: string | null;
  pendingMethod: string | null;
  connectedAt: number | null;
  following: number;
  read: number;
  followingSyncedAt: number | null;
  lastTickAt: number | null;
  running: boolean;
  backoffUntil: number | null;
};

export type Live<T> = { ok: true; data: T } | { ok: false; error: string; kind?: string };

// Quando o Convex não tem as funções do Feed (não foram publicadas) ou cai,
// a página mostra o aviso em vez de quebrar.
export const CONVEX_DOWN =
  "O Convex não respondeu às funções do Feed. Provavelmente elas ainda não foram publicadas: falta a CONVEX_DEPLOY_KEY na Vercel (veja o README, seção Publicar).";

async function safe<T>(call: () => Promise<Live<T>>): Promise<Live<T>> {
  try {
    return await call();
  } catch (err) {
    console.error("Feed/Convex:", (err as Error).message);
    return { ok: false, error: CONVEX_DOWN, kind: "convex" };
  }
}

export async function feedStatus(): Promise<FeedStatus | null> {
  if (!convexConfigured()) return null;
  return convex().query(api.instagram.data.status, { secret: serverSecret() });
}

export async function feedPage(before: number | undefined, reels: boolean, limit = 24): Promise<{ posts: FeedPost[]; next: number | null }> {
  if (!convexConfigured()) return { posts: [], next: null };
  return convex().query(api.instagram.data.feed, { secret: serverSecret(), limit, reels, ...(before ? { before } : {}) });
}

export async function searchInstagram(query: string): Promise<Live<FeedSearch>> {
  return safe(() => convex().action(api.instagram.sync.search, { secret: serverSecret(), query }));
}

export async function profileOf(username: string): Promise<Live<{ profile: FeedProfile; posts: FeedPost[]; next?: string }>> {
  return safe(() => convex().action(api.instagram.sync.profile, { secret: serverSecret(), username }));
}

export async function placeOf(pk: string): Promise<Live<{ name: string; address: string; posts: FeedPost[] }>> {
  return safe(() => convex().action(api.instagram.sync.place, { secret: serverSecret(), pk }));
}

export async function tagOf(name: string): Promise<Live<{ name: string; count: number; posts: FeedPost[] }>> {
  return safe(() => convex().action(api.instagram.sync.tag, { secret: serverSecret(), name }));
}
