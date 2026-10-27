import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { api, convex, convexConfigured, serverSecret } from "./convex";

export function passwordConfigured(): boolean {
  return Boolean(process.env.TOSO_PASSWORD);
}

export function passwordMatches(attempt: string): boolean {
  const expected = process.env.TOSO_PASSWORD;
  if (!expected) return false;
  // Hash dos dois lados: compara tamanhos iguais em tempo constante.
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Trava após 5 erros em 15 min. Com Convex, vale entre todas as instâncias
// da Vercel; sem ele, cai para memória (só serve no desenvolvimento).
const memory = { failures: 0, windowStart: 0, lockedUntil: 0 };

export async function lockedUntil(): Promise<number> {
  if (convexConfigured()) {
    const s = await convex().query(api.security.status, { secret: serverSecret() });
    return s.lockedUntil as number;
  }
  return memory.lockedUntil;
}

export async function registerFailure(): Promise<number> {
  if (convexConfigured()) {
    const s = await convex().mutation(api.security.registerFailure, { secret: serverSecret() });
    return s.lockedUntil as number;
  }
  const now = Date.now();
  if (now - memory.windowStart > 15 * 60_000) Object.assign(memory, { failures: 0, windowStart: now });
  memory.failures += 1;
  if (memory.failures >= 5) Object.assign(memory, { failures: 0, lockedUntil: now + 15 * 60_000 });
  return memory.lockedUntil;
}

export async function resetFailures(): Promise<void> {
  if (convexConfigured()) await convex().mutation(api.security.reset, { secret: serverSecret() });
  else Object.assign(memory, { failures: 0, lockedUntil: 0 });
}
