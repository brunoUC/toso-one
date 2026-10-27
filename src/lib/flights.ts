import "server-only";

// Formato do docs/data.json que o report.py do Flight Tracker publica.
export type Verdict = { key: "go" | "watch" | "hold" | "none"; label: string; why: string };

export type FlightRoute = {
  id: string;
  origin: string;
  destination: string;
  city: string;
  window: [string, string];
  stay: [number, number];
  targets: { buy: number; max: number };
  verdict: Verdict;
  nDays: number;
  stats: { min: number; p25: number; median: number; max: number } | null;
  best: {
    price: number;
    departDate: string;
    returnDate: string | null;
    airline: string | null;
    stops: number | null;
    duration: string | null;
    asOf: string;
    bookingUrl: string;
  } | null;
  series: { day: string; price: number }[];
};

export type FlightData = {
  schema: number;
  generatedAt: string;
  minDays: number;
  targets: { buy: number; max: number };
  windowText: string;
  hero: { state: "deal" | "stale" | "nothing" | "waiting"; routeId: string | null };
  lastRun: { started_at: string; ok: number; failed: number; expired: string[] } | null;
  routes: FlightRoute[];
};

export function flightsUrl(): string | null {
  return process.env.FLIGHTS_URL?.replace(/\/+$/, "") || null;
}

// O data.json muda uma vez por dia (coleta das 05:13). Cache de 10 min basta.
export async function fetchFlights(): Promise<{ data: FlightData | null; error: string | null }> {
  const base = flightsUrl();
  if (!base) return { data: null, error: "FLIGHTS_URL não configurado." };
  try {
    const res = await fetch(`${base}/data.json`, { next: { revalidate: 600 } });
    if (!res.ok) return { data: null, error: `O Flight Tracker respondeu ${res.status}.` };
    return { data: (await res.json()) as FlightData, error: null };
  } catch (err) {
    return { data: null, error: `Não foi possível ler os dados: ${(err as Error).message}` };
  }
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function tripText(best: NonNullable<FlightRoute["best"]>): string {
  if (!best.returnDate) return `ida ${fmtDay(best.departDate)}`;
  const days = Math.round((Date.parse(best.returnDate) - Date.parse(best.departDate)) / 86_400_000);
  return `ida ${fmtDay(best.departDate)} → volta ${fmtDay(best.returnDate)} · ${days} dias`;
}

export function detailsText(best: NonNullable<FlightRoute["best"]>): string {
  const stops = best.stops === null ? null : best.stops === 0 ? "direto" : best.stops === 1 ? "1 conexão" : `${best.stops} conexões`;
  return [best.airline ?? "companhia não informada", stops, best.duration].filter(Boolean).join(" · ");
}
