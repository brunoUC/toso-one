import { SignJWT, jwtVerify } from "jose";

// Sessão = um JWT assinado (HS256) num cookie HttpOnly. Não há tabela de
// sessões: só existe um usuário, e "sair" apaga o cookie deste aparelho.
// Este arquivo não importa nada do Next para poder rodar também no proxy.

export const SESSION_COOKIE = "toso_sessao";
export const CHALLENGE_COOKIE = "toso_desafio";
export const SESSION_DAYS = 90;

export type LoginMethod = "passkey" | "senha";

export type Session = {
  via: LoginMethod;
  device: string;
  issuedAt: number; // epoch s
  expiresAt: number; // epoch s
};

// Só para `next dev`. Fixo (e não aleatório por processo) porque o proxy e as
// rotas podem carregar este módulo em instâncias separadas.
const DEV_SECRET = "toso-one-dev-only-secret-nunca-use-em-producao";

function secretKey(): Uint8Array {
  const raw = process.env.TOSO_SESSION_SECRET;
  if (raw && raw.length >= 32) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV === "production") {
    throw new Error("TOSO_SESSION_SECRET ausente ou com menos de 32 caracteres.");
  }
  return new TextEncoder().encode(DEV_SECRET);
}

export async function signSession(via: LoginMethod, device: string): Promise<string> {
  return new SignJWT({ via, device })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], subject: "owner" });
    if (payload.via !== "passkey" && payload.via !== "senha") return null;
    return {
      via: payload.via,
      device: typeof payload.device === "string" ? payload.device : "aparelho",
      issuedAt: payload.iat ?? 0,
      expiresAt: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}

// Desafio do WebAuthn: guardado num cookie assinado de vida curta, para não
// precisar de banco entre o "options" e o "verify".
export async function signChallenge(challenge: string, kind: "auth" | "reg"): Promise<string> {
  return new SignJWT({ c: challenge, k: kind })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secretKey());
}

export async function readChallenge(token: string | undefined, kind: "auth" | "reg"): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.k === kind && typeof payload.c === "string" ? payload.c : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 5 * 60,
};
