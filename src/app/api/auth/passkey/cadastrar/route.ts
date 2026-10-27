import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { deviceLabel, getSession, relyingParty } from "@/lib/auth";
import { api, convex, serverSecret } from "@/lib/convex";
import { CHALLENGE_COOKIE, readChallenge } from "@/lib/session";
import { passkeysUnavailable } from "@/lib/webauthn";

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const unavailable = passkeysUnavailable();
  if (unavailable) return unavailable;

  const jar = await cookies();
  const challenge = await readChallenge(jar.get(CHALLENGE_COOKIE)?.value, "reg");
  jar.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  if (!challenge) return NextResponse.json({ error: "Desafio expirado. Tente de novo." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { response?: RegistrationResponseJSON } | null;
  if (!body?.response) return NextResponse.json({ error: "Resposta inválida." }, { status: 400 });

  const { origin, rpID } = await relyingParty();
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified || !registrationInfo) throw new Error("cadastro não verificado");

    const { credential, credentialBackedUp } = registrationInfo;
    const deviceName = await deviceLabel();
    await convex().mutation(api.passkeys.add, {
      secret: serverSecret(),
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? body.response.response.transports ?? [],
      deviceName,
      backedUp: credentialBackedUp,
    });
    return NextResponse.json({ ok: true, deviceName });
  } catch (err) {
    return NextResponse.json({ error: `Não foi possível cadastrar: ${(err as Error).message}` }, { status: 400 });
  }
}
