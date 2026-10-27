import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

// Defesa em profundidade: o proxy já barra as rotas privadas, mas cada página
// e rota privada confere de novo, para não depender de uma camada só.
export async function requireSession(from: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/entrar?de=${encodeURIComponent(from)}`);
  return session;
}

// Origem e RP ID do WebAuthn vêm do próprio pedido, então o Face ID funciona
// no domínio de produção e em localhost sem configuração. TOSO_ORIGIN fixa
// um domínio quando houver mais de um apontando para o mesmo deploy.
export async function relyingParty(): Promise<{ origin: string; rpID: string }> {
  const fixed = process.env.TOSO_ORIGIN?.replace(/\/+$/, "");
  if (fixed) return { origin: fixed, rpID: new URL(fixed).hostname };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return { origin, rpID: new URL(origin).hostname };
}

export async function deviceLabel(): Promise<string> {
  const ua = (await headers()).get("user-agent") ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Aparelho";
}

export function safeNext(raw: unknown): string {
  // Só caminhos internos: evita redirecionar para outro site depois do login.
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}
