import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { relyingParty } from "@/lib/auth";
import { CHALLENGE_COOKIE, challengeCookieOptions, signChallenge } from "@/lib/session";
import { passkeysUnavailable } from "@/lib/webauthn";

export async function POST() {
  const unavailable = passkeysUnavailable();
  if (unavailable) return unavailable;

  const { rpID } = await relyingParty();
  // Sem allowCredentials: o aparelho oferece a passkey que tiver para este
  // domínio (credencial "descobrível"), sem precisar digitar usuário.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, await signChallenge(options.challenge, "auth"), challengeCookieOptions);
  return NextResponse.json(options);
}
