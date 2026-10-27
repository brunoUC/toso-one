import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { relyingParty, safeNext } from "@/lib/auth";
import { api, convex, logEvent, serverSecret } from "@/lib/convex";
import { resetFailures } from "@/lib/password";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  readChallenge,
  sessionCookieOptions,
  signSession,
} from "@/lib/session";
import { passkeysUnavailable } from "@/lib/webauthn";

export async function POST(request: Request) {
  const unavailable = passkeysUnavailable();
  if (unavailable) return unavailable;

  const jar = await cookies();
  const challenge = await readChallenge(jar.get(CHALLENGE_COOKIE)?.value, "auth");
  jar.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  if (!challenge) return NextResponse.json({ error: "Desafio expirado. Tente de novo." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON; de?: unknown } | null;
  if (!body?.response?.id) return NextResponse.json({ error: "Resposta inválida." }, { status: 400 });

  const stored = await convex().query(api.passkeys.get, { secret: serverSecret(), credentialId: body.response.id });
  if (!stored) {
    return NextResponse.json(
      { error: "Este aparelho não tem Face ID cadastrado. Entre com a senha e ative em Ajustes." },
      { status: 404 },
    );
  }

  const { origin, rpID } = await relyingParty();
  let verified = false;
  let newCounter = stored.counter as number;
  try {
    const result = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports,
      },
    });
    verified = result.verified;
    newCounter = result.authenticationInfo.newCounter;
  } catch (err) {
    return NextResponse.json({ error: `Não foi possível validar: ${(err as Error).message}` }, { status: 400 });
  }
  if (!verified) return NextResponse.json({ error: "Face ID não confirmado." }, { status: 401 });

  await convex().mutation(api.passkeys.touch, {
    secret: serverSecret(),
    credentialId: stored.credentialId,
    counter: newCounter,
  });
  await resetFailures();
  jar.set(SESSION_COOKIE, await signSession("passkey", stored.deviceName), sessionCookieOptions);
  await logEvent("login_passkey", stored.deviceName);
  return NextResponse.json({ ok: true, next: safeNext(body.de) });
}
