import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getSession, relyingParty } from "@/lib/auth";
import { listPasskeys } from "@/lib/convex";
import { CHALLENGE_COOKIE, challengeCookieOptions, signChallenge } from "@/lib/session";
import { passkeysUnavailable, RP_NAME, USER_ID } from "@/lib/webauthn";

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const unavailable = passkeysUnavailable();
  if (unavailable) return unavailable;

  const { rpID } = await relyingParty();
  const existing = await listPasskeys();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: USER_ID,
    userName: "toso",
    userDisplayName: "toso one",
    attestationType: "none",
    // Impede cadastrar duas vezes a mesma passkey.
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, await signChallenge(options.challenge, "reg"), challengeCookieOptions);
  return NextResponse.json(options);
}
