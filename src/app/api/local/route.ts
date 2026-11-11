import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";
import { PLACE_COOKIE, parsePlace } from "@/lib/place";

// Nome da cidade pelas coordenadas (OpenStreetMap/Nominatim, uso leve:
// só quando ele muda de lugar). Cache de um dia por coordenada.
async function cityName(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=pt-BR`;
    const res = await fetch(url, { headers: { "User-Agent": "toso-one/1.0 (app pessoal)" }, signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    return a.city || a.town || a.municipality || a.village || a.county || a.state || null;
  } catch {
    return null;
  }
}

// O navegador manda onde está (GPS, só com permissão) para o tempo seguir a
// cidade. Fica num cookie deste aparelho e, com sessão, também como "último
// lugar" no Convex, que é o que o resumo da manhã usa.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { lat?: unknown; lon?: unknown; name?: unknown } | null;
  const place = parsePlace(JSON.stringify(body ?? {}));
  if (!place) return NextResponse.json({ error: "Localização inválida." }, { status: 400 });
  place.name = (await cityName(place.lat, place.lon)) ?? place.name;
  const value = JSON.stringify(place);
  if ((await getSession()) && convexConfigured()) {
    try {
      await convex().mutation(api.settings.set, { secret: serverSecret(), key: "local", value });
    } catch {
      // O cookie basta para a página; o resumo da manhã fica com o lugar anterior.
    }
  }
  const res = NextResponse.json({ ok: true, place });
  res.cookies.set(PLACE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  });
  return res;
}

// "Voltar para a cidade pelo IP": apaga o cookie deste aparelho.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PLACE_COOKIE);
  return res;
}
