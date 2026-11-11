import "server-only";
import { cookies, headers } from "next/headers";
import { api, convex, convexConfigured, serverSecret } from "./convex";

// Onde ele está, para a previsão do tempo. Nesta ordem:
//  1. o GPS do aparelho (cookie gravado por /api/local quando ele permite);
//  2. a cidade pelo IP, que a Vercel manda em cada pedido;
//  3. o último lugar conhecido no Convex (é o que o resumo da manhã usa);
//  4. TOSO_LAT / TOSO_LON / TOSO_PLACE, ou São Paulo.

export type Place = { lat: number; lon: number; name: string | null; source: "gps" | "ip" | "ultimo" | "padrao" };

export const PLACE_COOKIE = "toso_local";

// Duas casas decimais: ~1 km. Basta para o tempo e não guarda o endereço.
export const round = (n: number) => Math.round(n * 100) / 100;
const valid = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

export function defaultPlace(): Place {
  const lat = Number(process.env.TOSO_LAT || -23.5505);
  const lon = Number(process.env.TOSO_LON || -46.6333);
  return { lat, lon, name: process.env.TOSO_PLACE || "São Paulo", source: "padrao" };
}

export function parsePlace(raw: string | undefined | null): Omit<Place, "source"> | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { lat?: unknown; lon?: unknown; name?: unknown };
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!valid(lat, lon)) return null;
    return { lat: round(lat), lon: round(lon), name: typeof p.name === "string" && p.name ? p.name.slice(0, 80) : null };
  } catch {
    return null;
  }
}

export async function lastKnownPlace(): Promise<Place | null> {
  if (!convexConfigured()) return null;
  try {
    const row = (await convex().query(api.settings.get, { secret: serverSecret(), key: "local" })) as { value: string } | null;
    const p = parsePlace(row?.value);
    return p ? { ...p, source: "ultimo" } : null;
  } catch {
    return null;
  }
}

function ipPlace(h: Headers): Place | null {
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lon = Number(h.get("x-vercel-ip-longitude"));
  if (!h.get("x-vercel-ip-latitude") || !valid(lat, lon)) return null;
  let name: string | null = null;
  try {
    name = decodeURIComponent(h.get("x-vercel-ip-city") ?? "") || null;
  } catch {
    name = h.get("x-vercel-ip-city");
  }
  return { lat: round(lat), lon: round(lon), name, source: "ip" };
}

// Para as páginas (há um pedido do navegador).
export async function currentPlace(): Promise<Place> {
  const gps = parsePlace((await cookies()).get(PLACE_COOKIE)?.value);
  if (gps) return { ...gps, source: "gps" };
  return ipPlace(await headers()) ?? (await lastKnownPlace()) ?? defaultPlace();
}
