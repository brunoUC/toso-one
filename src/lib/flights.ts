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
  best: (Fare & { asOf: string }) | null;
  series: { day: string; price: number }[];
  fares: (Fare & { seenOn: string; options: number | null })[];
  searchUrl: string;
};

// Uma tarifa vista: par (ida, volta) com o itinerário mais barato. Horários,
// chegada e avaliação do Google só existem nas coletas a partir de 27/10/2026.
export type Fare = {
  price: number;
  departDate: string;
  returnDate: string | null;
  airline: string | null;
  stops: number | null;
  duration: string | null;
  departTime: string | null;
  arriveTime: string | null;
  arriveAhead: number;
  googleLevel: "baixo" | "típico" | "alto" | null;
  bookingUrl: string;
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

// Produção do Flight Tracker na Vercel. Não é segredo; FLIGHTS_URL sobrescreve.
const DEFAULT_FLIGHTS_URL = "https://flight-tracker-seven-drab-10.vercel.app";

export function flightsUrl(): string | null {
  return (process.env.FLIGHTS_URL || DEFAULT_FLIGHTS_URL).replace(/\/+$/, "") || null;
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

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// "qui, 10 mai 2027"
export function fmtDayLong(iso: string): string {
  const date = utc(iso);
  return `${WEEKDAYS_LONG[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function addDays(iso: string, days: number): string {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function stayDays(fare: Pick<Fare, "departDate" | "returnDate">): number | null {
  return fare.returnDate ? Math.round((Date.parse(fare.returnDate) - Date.parse(fare.departDate)) / 86_400_000) : null;
}

export function stopsText(stops: number | null): string | null {
  return stops === null ? null : stops === 0 ? "direto" : stops === 1 ? "1 conexão" : `${stops} conexões`;
}

export function tripText(best: Pick<Fare, "departDate" | "returnDate">): string {
  if (!best.returnDate) return `ida ${fmtDay(best.departDate)}`;
  const days = Math.round((Date.parse(best.returnDate) - Date.parse(best.departDate)) / 86_400_000);
  return `ida ${fmtDay(best.departDate)} → volta ${fmtDay(best.returnDate)} · ${days} dias`;
}

export function detailsText(best: Pick<Fare, "airline" | "stops" | "duration">): string {
  return [best.airline ?? "companhia não informada", stopsText(best.stops), best.duration].filter(Boolean).join(" · ");
}

export async function fetchRoute(id: string): Promise<{ data: FlightData | null; route: FlightRoute | null; error: string | null }> {
  const { data, error } = await fetchFlights();
  return { data, route: data?.routes.find((r) => r.id === id) ?? null, error };
}
