import "server-only";
import type { IconName } from "@/components/Icon";
import type { Routine } from "../../convex/routines";
import { calendarConfigured, getCalendar, type CalEvent } from "./calendar";
import { api, convex, convexConfigured, serverSecret } from "./convex";
import { highlightOfTheDay } from "./estante";
import { getOverview } from "./financas";
import { holidayMap, shiftDay, upcomingHolidays, weekday, type Holiday, type UpcomingHoliday } from "./holidays";
import { getWeather, type DayWeather, type Weather } from "./weather";
import { defaultPlace, type Place } from "./place";

export type { Routine };

// O feed da página inicial: a semana (hoje + 6 dias) juntando a agenda do
// Google, as rotinas, os feriados, a previsão e as contas que costumam
// vencer. Não é lista de tarefas: nada aqui se marca como feito.

const TZ = "America/Sao_Paulo";
export const DAYS = 7;

export type FeedItem = {
  key: string;
  kind: "event" | "routine" | "holiday" | "bill" | "card";
  icon: IconName;
  time: string | null; // HH:MM; null = o dia todo
  end: string | null;
  title: string;
  sub: string | null;
  href: string | null;
};

export type FeedDay = {
  date: string;
  weekday: number;
  holiday: Holiday | null;
  weather: DayWeather | null;
  items: FeedItem[];
};

export type Feed = {
  today: string;
  nowHour: number;
  weather: Weather | null;
  days: FeedDay[];
  holidays: UpcomingHoliday[];
  routines: Routine[];
  calendar: { configured: boolean; errors: string[] };
  highlight: { text: string; book: string; author: string | null } | null;
};

export function todayInSp(now = new Date()): { today: string; hour: number } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return { today, hour };
}

export async function getRoutines(): Promise<Routine[]> {
  if (!convexConfigured()) return [];
  try {
    return await convex().query(api.routines.list, { secret: serverSecret() });
  } catch {
    return [];
  }
}

const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

// Contas do mês (Finanças) que ainda não apareceram no extrato, no dia em
// que costumam ser pagas, e os avisos de fatura que fecha.
async function billItems(today: string, last: string): Promise<Map<string, FeedItem[]>> {
  const out = new Map<string, FeedItem[]>();
  const push = (date: string, item: FeedItem) => out.set(date, [...(out.get(date) ?? []), item]);
  try {
    const ov = await getOverview();
    if (!ov) return out;
    for (const c of ov.checklist) {
      if (c.paid.length || !c.typicalDay) continue;
      const due = `${today.slice(0, 8)}${String(c.typicalDay).padStart(2, "0")}`;
      // Já passou do dia de costume: lembra hoje.
      const date = due < today ? today : due;
      if (date > last) continue;
      push(date, {
        key: `bill-${c.key}`,
        kind: "bill",
        icon: "check",
        time: null,
        end: null,
        title: `Pagar ${c.name.charAt(0).toLowerCase()}${c.name.slice(1)}`,
        sub: [due < today ? `costuma ser dia ${c.typicalDay}, ainda não apareceu no extrato` : null, c.lastAmount ? `mês passado ${brl(c.lastAmount)}` : null]
          .filter(Boolean)
          .join(" · ") || null,
        href: "/financas/painel",
      });
    }
    for (const p of ov.cardPlans) {
      if (p.closeDate < today || p.closeDate > last) continue;
      push(p.shortfall > 0 ? today : p.closeDate, {
        key: `card-${p.itemId}`,
        kind: "card",
        icon: "bell",
        time: null,
        end: null,
        title: p.shortfall > 0 ? `Transferir ${brl(p.transfer)} para o ${p.bank}` : `Fatura do ${p.bank} fecha`,
        sub: p.shortfall > 0 ? `fatura de ${brl(p.bill)} fecha ${p.closeDate.slice(8)}/${p.closeDate.slice(5, 7)}${p.from ? ` · tirar da ${p.from}` : ""}` : `${brl(p.bill)}, a conta cobre`,
        href: "/financas/orcamento",
      });
    }
  } catch {
    // Finanças fora do ar não derrubam o feed.
  }
  return out;
}

function eventItem(e: CalEvent, multiCalendar: boolean): FeedItem {
  const sub = [e.location, multiCalendar ? e.calendar : null].filter(Boolean).join(" · ") || null;
  return { key: e.id, kind: "event", icon: "calendar", time: e.start, end: e.end, title: e.title, sub, href: null };
}

// personal = false (sem sessão): só tempo e feriados, nada de agenda,
// rotinas ou contas.
export async function getFeed({ personal = true, place = defaultPlace() }: { personal?: boolean; place?: Place } = {}): Promise<Feed> {
  const { today, hour } = todayInSp();
  const last = shiftDay(today, DAYS - 1);
  const [weather, routines, cal, bills, highlight] = await Promise.all([
    getWeather(place),
    personal ? getRoutines() : Promise.resolve([] as Routine[]),
    personal && calendarConfigured() ? getCalendar(today, last) : Promise.resolve({ events: [] as CalEvent[], errors: [] as string[] }),
    personal ? billItems(today, last) : Promise.resolve(new Map<string, FeedItem[]>()),
    personal ? highlightOfTheDay(today) : Promise.resolve(null),
  ]);
  const holidays = holidayMap(today, last);
  const multiCalendar = new Set(cal.events.map((e) => e.calendar)).size > 1;

  const days: FeedDay[] = [];
  for (let i = 0; i < DAYS; i++) {
    const date = shiftDay(today, i);
    const wd = weekday(date);
    const holiday = holidays.get(date) ?? null;
    const items: FeedItem[] = [];
    if (holiday) {
      items.push({ key: `hol-${date}`, kind: "holiday", icon: "party", time: null, end: null, title: holiday.name, sub: holiday.kind === "nacional" ? "feriado" : holiday.kind === "facultativo" ? "ponto facultativo" : `feriado ${holiday.kind}`, href: null });
    }
    for (const r of routines) {
      if (!r.days.includes(wd)) continue;
      if (holiday && r.skipHolidays) continue;
      items.push({ key: `rot-${r.id}-${date}`, kind: "routine", icon: "repeat", time: r.time, end: null, title: r.title, sub: r.note, href: null });
    }
    const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const e of cal.events) {
      if (e.date > date || e.lastDate < date) continue;
      // A agenda "Feriados no Brasil" do Google repete o que já calculamos.
      if (holiday && e.allDay && norm(e.title).includes(norm(holiday.name).split(" ")[0])) continue;
      items.push(eventItem(e, multiCalendar));
    }
    items.push(...(bills.get(date) ?? []));
    // O dia todo primeiro, depois por horário.
    items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    days.push({ date, weekday: wd, holiday, weather: weather?.days.find((d) => d.date === date) ?? null, items });
  }

  return {
    today,
    nowHour: hour,
    weather,
    days,
    holidays: upcomingHolidays(today, 4),
    routines,
    calendar: { configured: calendarConfigured(), errors: cal.errors },
    highlight: highlight ? { text: highlight.text, book: highlight.book, author: highlight.author } : null,
  };
}

// ── Resumo da manhã (push) ──────────────────────────────────────────────────

const WEEKDAY = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function morningDigest(feed: Feed): { title: string; body: string } | null {
  const day = feed.days[0];
  const w = day.weather;
  const title = `${WEEKDAY[day.weekday]}${w ? ` · ${w.min}°–${w.max}°, ${w.label.toLowerCase()}` : ""}`;
  const lines: string[] = [];
  for (const it of day.items) {
    if (it.kind === "holiday") lines.push(`Feriado: ${it.title}`);
    else lines.push(`${it.time ? `${it.time} ` : ""}${it.title}`);
  }
  if (feed.weather?.rainHint) lines.push(feed.weather.rainHint);
  const next = feed.holidays[0];
  if (next && next.daysUntil > 0 && next.daysUntil <= 7) lines.push(`${next.name} em ${next.daysUntil} ${next.daysUntil === 1 ? "dia" : "dias"} (${next.weekdayName})`);
  if (!lines.length) return null;
  const MAX = 6;
  const body = lines.length > MAX ? [...lines.slice(0, MAX - 1), `+${lines.length - MAX + 1} no toso one`].join("\n") : lines.join("\n");
  return { title, body };
}
