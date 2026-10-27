import "server-only";
import { NextResponse } from "next/server";
import { convexConfigured } from "./convex";

export const RP_NAME = "toso one";
// Um usuário só: o "user handle" é fixo, e cada aparelho vira uma credencial.
export const USER_ID = new TextEncoder().encode("toso-one-owner");

export function passkeysUnavailable(): NextResponse | null {
  if (convexConfigured()) return null;
  return NextResponse.json(
    { error: "Face ID indisponível: o Convex ainda não foi configurado." },
    { status: 503 },
  );
}
