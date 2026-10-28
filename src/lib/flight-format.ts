// Formatação de voos usada tanto no servidor quanto no navegador (por isso
// fora de flights.ts, que é "server-only").

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WD_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

// "qui 11/05"
export function dayShort(iso: string): string {
  const d = utc(iso);
  return `${WD[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "quinta, 11 mai 2027"
export function dayLong(iso: string): string {
  const d = utc(iso);
  return `${WD_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function stopsText(stops: number | null | undefined): string | null {
  return stops == null ? null : stops === 0 ? "direto" : stops === 1 ? "1 conexão" : `${stops} conexões`;
}

// "3h40": espera entre dois voos, pelos horários locais do mesmo aeroporto.
export function layover(arr: string, dep: string): string | null {
  const minutes = Math.round((Date.parse(dep + ":00Z") - Date.parse(arr + ":00Z")) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export const SOURCE_NAME: Record<string, string> = { google: "Google Flights", ignav: "Ignav" };
