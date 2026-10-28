import "server-only";
import airports from "@/data/airports.json";
import coords from "@/data/airport-coords.json";
import { countryName, type Airport } from "./airports";
import { fareStatus, type FareStatus, type Targets } from "./fare-status";
import type { FlightRoute } from "./flights";

// Destinos em destaque na página de Voos, na ordem em que aparecem. Cada um
// junta os aeroportos da cidade (Roma: FCO e CIA; Tóquio: HND e NRT).
export const FEATURED = [
  { key: "LIS", city: "Lisboa", country: "Portugal", codes: ["LIS"] },
  { key: "MAD", city: "Madri", country: "Espanha", codes: ["MAD"] },
  { key: "FCO", city: "Roma", country: "Itália", codes: ["FCO", "CIA"] },
  { key: "ATH", city: "Atenas", country: "Grécia", codes: ["ATH"] },
  { key: "VIE", city: "Viena", country: "Áustria", codes: ["VIE"] },
  { key: "HND", city: "Tóquio", country: "Japão", codes: ["HND", "NRT"] },
] as const;

export type DestinationGroup = {
  key: string;
  city: string;
  country: string;
  codes: string[];
  featured: boolean;
  routes: FlightRoute[]; // mais barata primeiro; sem preço no fim
  best: FlightRoute | null;
  targets: Targets;
  status: FareStatus;
  coverage: { seen: number; total: number } | null;
  window: [string, string] | null; // a mais comum entre as origens
  stay: [number, number] | null;
  datesVary: boolean;
};

const AIRPORTS = new Map((airports as Airport[]).map((a) => [a.i, a]));
const COORDS = coords as unknown as Record<string, [number, number]>;

export const airportCity = (code: string) => AIRPORTS.get(code)?.c ?? code;
export const airportCountry = (code: string) => {
  const k = AIRPORTS.get(code)?.k;
  return k ? countryName(k) : "";
};
export const airportCoords = (code: string): [number, number] | null => COORDS[code] ?? null;
export const airportByCode = (code: string): Airport | null => AIRPORTS.get(code) ?? null;

const price = (r: FlightRoute) => r.best?.price ?? Infinity;

function mostCommon<T>(items: T[]): { value: T | null; varies: boolean } {
  const counts = new Map<string, { v: T; n: number }>();
  for (const it of items) {
    const k = JSON.stringify(it);
    counts.set(k, { v: it, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return { value: top?.v ?? null, varies: counts.size > 1 };
}

function group(key: string, city: string, country: string, codes: string[], featured: boolean, all: FlightRoute[], defaults: Targets): DestinationGroup {
  const routes = all.filter((r) => codes.includes(r.destination)).sort((a, b) => price(a) - price(b) || a.origin.localeCompare(b.origin));
  const best = routes.find((r) => r.best) ?? null;
  const targets = best?.targets ?? routes[0]?.targets ?? defaults;
  const withCov = routes.filter((r) => r.coverage);
  const win = mostCommon(routes.map((r) => r.window));
  const stay = mostCommon(routes.map((r) => r.stay));
  return {
    key,
    city,
    country,
    codes,
    featured,
    routes,
    best,
    targets,
    status: fareStatus(best?.best?.price, targets),
    coverage: withCov.length
      ? { seen: withCov.reduce((s, r) => s + r.coverage!.seen, 0), total: withCov.reduce((s, r) => s + r.coverage!.total, 0) }
      : null,
    window: win.value,
    stay: stay.value,
    datesVary: win.varies || stay.varies,
  };
}

// Destaques primeiro (mesmo sem rota, para mostrar que estão faltando), depois
// os outros destinos com rota, do mais barato para o mais caro.
export function groupByDestination(routes: FlightRoute[], defaults: Targets): { featured: DestinationGroup[]; others: DestinationGroup[] } {
  const featured = FEATURED.map((f) => group(f.key, f.city, f.country, [...f.codes], true, routes, defaults));
  const taken = new Set(FEATURED.flatMap((f) => f.codes as readonly string[]));
  const rest = [...new Set(routes.map((r) => r.destination))].filter((d) => !taken.has(d));
  const others = rest
    .map((d) => group(d, routes.find((r) => r.destination === d)!.city, airportCountry(d), [d], false, routes, defaults))
    .sort((a, b) => (a.best ? price(a.best) : Infinity) - (b.best ? price(b.best) : Infinity) || a.city.localeCompare(b.city));
  return { featured, others };
}
