// Feriados calculados aqui, sem depender de API: os fixos, os que dependem
// da Páscoa e os de São Paulo (estado e capital). Carnaval e Corpus Christi
// são ponto facultativo na lei federal, mas quase todo mundo folga; Corpus
// Christi é feriado municipal na capital.

export type HolidayKind = "nacional" | "estadual" | "municipal" | "facultativo";
export type Holiday = { date: string; name: string; kind: HolidayKind };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86400_000;
export const shiftDay = (d: string, n: number) => iso(new Date(Date.parse(d + "T12:00:00Z") + n * DAY));
export const weekday = (d: string) => new Date(d + "T12:00:00Z").getUTCDay(); // 0 = domingo
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY);

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function holidaysOf(year: number): Holiday[] {
  const y = String(year);
  const e = easter(year);
  const list: Holiday[] = [
    { date: `${y}-01-01`, name: "Confraternização Universal", kind: "nacional" },
    { date: `${y}-01-25`, name: "Aniversário de São Paulo", kind: "municipal" },
    { date: shiftDay(e, -48), name: "Carnaval", kind: "facultativo" },
    { date: shiftDay(e, -47), name: "Carnaval", kind: "facultativo" },
    { date: shiftDay(e, -2), name: "Sexta-feira Santa", kind: "nacional" },
    { date: `${y}-04-21`, name: "Tiradentes", kind: "nacional" },
    { date: `${y}-05-01`, name: "Dia do Trabalho", kind: "nacional" },
    { date: shiftDay(e, 60), name: "Corpus Christi", kind: "municipal" },
    { date: `${y}-07-09`, name: "Revolução Constitucionalista", kind: "estadual" },
    { date: `${y}-09-07`, name: "Independência", kind: "nacional" },
    { date: `${y}-10-12`, name: "Nossa Senhora Aparecida", kind: "nacional" },
    { date: `${y}-11-02`, name: "Finados", kind: "nacional" },
    { date: `${y}-11-15`, name: "Proclamação da República", kind: "nacional" },
    { date: `${y}-11-20`, name: "Consciência Negra", kind: "nacional" },
    { date: `${y}-12-25`, name: "Natal", kind: "nacional" },
  ];
  return list.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function holidayMap(from: string, to: string): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysOf(y)) if (h.date >= from && h.date <= to) map.set(h.date, h);
  }
  return map;
}

export type Span = { from: string; to: string; days: number };

export type UpcomingHoliday = Holiday & {
  daysUntil: number;
  weekdayName: string;
  // Dias seguidos de folga contando fim de semana e outros feriados.
  off: Span;
  // Terça ou quinta: o dia da "ponte" e quanto a folga vira com ele.
  bridge: (Span & { date: string }) | null;
  weekend: boolean; // cai no sábado ou domingo
};

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function upcomingHolidays(today: string, count = 3): UpcomingHoliday[] {
  const y = Number(today.slice(0, 4));
  const all = [...holidaysOf(y), ...holidaysOf(y + 1)];
  const offDays = new Set(all.map((h) => h.date));
  const isOff = (d: string) => offDays.has(d) || weekday(d) === 0 || weekday(d) === 6;
  const spanAround = (d: string, extra?: string): Span => {
    const off = (x: string) => isOff(x) || x === extra;
    let from = d;
    let to = d;
    while (off(shiftDay(from, -1))) from = shiftDay(from, -1);
    while (off(shiftDay(to, 1))) to = shiftDay(to, 1);
    return { from, to, days: daysBetween(from, to) + 1 };
  };

  const out: UpcomingHoliday[] = [];
  const seen = new Set<string>();
  for (const h of all) {
    if (h.date < today) continue;
    const off = spanAround(h.date);
    // Carnaval são dois dias: um bloco só.
    const key = `${off.from}:${off.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const wd = weekday(h.date);
    const bridgeDate = wd === 2 ? shiftDay(h.date, -1) : wd === 4 ? shiftDay(h.date, 1) : null;
    const bridge = bridgeDate && !isOff(bridgeDate) ? { date: bridgeDate, ...spanAround(h.date, bridgeDate) } : null;
    out.push({
      ...h,
      daysUntil: daysBetween(today, h.date),
      weekdayName: WEEKDAY[wd],
      off,
      bridge,
      weekend: wd === 0 || wd === 6,
    });
    if (out.length >= count) break;
  }
  return out;
}
