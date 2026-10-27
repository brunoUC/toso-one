const TZ = "America/Sao_Paulo";

export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  if (hour >= 5 && hour < 12) return "Bom dia.";
  if (hour >= 12 && hour < 18) return "Boa tarde.";
  return "Boa noite.";
}

export function dateEyebrow(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: TZ }).format(now).replace("-feira", "");
  const date = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })
    .format(now)
    .replace(/\./g, "")
    .replace(/ de /g, " ");
  return `${weekday} · ${date}`;
}

export function relativeDay(ms: number, now = Date.now()): string {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: TZ }).format(ms);
  const sameDay = fmt({ dateStyle: "short" }) === new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ }).format(now);
  if (sameDay) return `hoje ${fmt({ hour: "2-digit", minute: "2-digit" })}`;
  return fmt({ day: "numeric", month: "short" }).replace(".", "").replace(" de ", " ");
}

export const brl = (v: number, digits = 0) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const compact = (v: number) =>
  v >= 1e6
    ? (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi"
    : v >= 1e3
      ? Math.round(v / 1e3) + " mil"
      : String(Math.round(v));

export const pct = (v: number, digits = 1) =>
  (v >= 0 ? "+" : "−") + Math.abs(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
