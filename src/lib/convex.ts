import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

// O Next fala com o Convex só pelo servidor, sempre mandando o segredo
// compartilhado. O navegador nunca recebe a URL nem o segredo.

export const api = anyApi;

export function convexConfigured(): boolean {
  return Boolean(convexUrl() && serverSecret());
}

function convexUrl(): string | undefined {
  return process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || undefined;
}

export function serverSecret(): string {
  return process.env.TOSO_SERVER_SECRET ?? "";
}

let client: ConvexHttpClient | null = null;

export function convex(): ConvexHttpClient {
  const url = convexUrl();
  if (!url) throw new Error("Convex não configurado (NEXT_PUBLIC_CONVEX_URL).");
  client ??= new ConvexHttpClient(url);
  return client;
}

export type StoredPasskey = {
  credentialId: string;
  transports: string[];
  deviceName: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export type ActivityEvent = { kind: string; detail: string; at: number };

export async function listPasskeys(): Promise<StoredPasskey[]> {
  if (!convexConfigured()) return [];
  return convex().query(api.passkeys.list, { secret: serverSecret() });
}

export async function recentEvents(limit = 6): Promise<ActivityEvent[]> {
  if (!convexConfigured()) return [];
  try {
    return await convex().query(api.events.recent, { secret: serverSecret(), limit });
  } catch {
    return [];
  }
}

export async function logEvent(kind: string, detail: string): Promise<void> {
  if (!convexConfigured()) return;
  try {
    await convex().mutation(api.events.log, { secret: serverSecret(), kind, detail });
  } catch {
    // Atividade é informativa; nunca derruba um login.
  }
}
