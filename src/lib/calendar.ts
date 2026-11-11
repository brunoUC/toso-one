import "server-only";
import ICAL from "ical.js";

// Agenda do Google Calendar pelo "endereço secreto no formato iCal" de cada
// agenda (Google Calendar → Configurações da agenda → Integrar agenda). É só
// leitura, não precisa de OAuth e a URL fica só no servidor.
//
// GCAL_ICS: uma agenda por linha (ou separadas por vírgula), no formato
// "Nome|https://calendar.google.com/calendar/ical/.../basic.ics". O nome é
// opcional; sem ele vale o nome que a própria agenda informa.

const TZ = "America/Sao_Paulo";

export type CalEvent = {
  id: string;
  title: string;
  calendar: string;
  allDay: boolean;
  date: string; // AAAA-MM-DD do início (horário de Brasília)
  lastDate: string; // último dia (para eventos de dia inteiro com vários dias)
  start: string | null; // HH:MM
  end: string | null;
  startMs: number;
  location: string | null;
};

type Source = { name: string | null; url: string };

export function calendarSources(): Source[] {
  return (process.env.GCAL_ICS ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf("|");
      return i > 0 && !s.slice(0, i).includes("://") ? { name: s.slice(0, i).trim(), url: s.slice(i + 1).trim() } : { name: null, url: s };
    })
    .filter((s) => /^https:\/\//.test(s.url));
}

export const calendarConfigured = () => calendarSources().length > 0;

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localDate = (ms: number) => dateFmt.format(ms);
const localTime = (ms: number) => timeFmt.format(ms);
const dayBefore = (d: string) => new Date(Date.parse(d + "T12:00:00Z") - 86400_000).toISOString().slice(0, 10);

function toEvent(ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, calendar: string, key: string): CalEvent {
  const title = (ev.summary || "(sem título)").trim();
  const location = ev.location?.trim() || null;
  if (start.isDate) {
    const date = start.toString().slice(0, 10);
    // DTEND de dia inteiro é exclusivo.
    const endDate = end?.isDate ? end.toString().slice(0, 10) : date;
    const lastDate = endDate > date ? dayBefore(endDate) : date;
    return { id: key, title, calendar, allDay: true, date, lastDate, start: null, end: null, startMs: Date.parse(date + "T03:00:00Z"), location };
  }
  const s = start.toJSDate().getTime();
  const e = end ? end.toJSDate().getTime() : s;
  return { id: key, title, calendar, allDay: false, date: localDate(s), lastDate: localDate(s), start: localTime(s), end: localTime(e), startMs: s, location };
}

// Eventos (e repetições) que tocam o intervalo [from, to], datas inclusivas.
export function parseIcs(text: string, fallbackName: string, from: string, to: string): { name: string; events: CalEvent[] } {
  const comp = new ICAL.Component(ICAL.parse(text));
  const name = fallbackName || (comp.getFirstPropertyValue("x-wr-calname") as string | null) || "Agenda";
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // Fuso repetido ou inválido: o ical.js cai no UTC, o que ainda serve.
    }
  }

  const vevents = comp.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  // Margem de um dia dos dois lados por causa do fuso.
  const lo = ICAL.Time.fromDateString(dayBefore(from));
  const hi = ICAL.Time.fromDateString(new Date(Date.parse(to + "T12:00:00Z") + 2 * 86400_000).toISOString().slice(0, 10));
  const touches = (e: CalEvent) => e.lastDate >= from && e.date <= to;
  const cancelled = (ev: ICAL.Event) => String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

  const out: CalEvent[] = [];
  for (const ev of masters.values()) {
    if (cancelled(ev)) continue;
    if (!ev.isRecurring()) {
      const e = toEvent(ev, ev.startDate, ev.endDate, name, ev.uid);
      if (touches(e)) out.push(e);
      continue;
    }
    const it = ev.iterator();
    for (let n = 0, next = it.next(); next && n < 20000; n++, next = it.next()) {
      if (next.compare(hi) > 0) break;
      const det = ev.getOccurrenceDetails(next);
      if (det.endDate && det.endDate.compare(lo) < 0) continue;
      if (cancelled(det.item)) continue;
      const e = toEvent(det.item, det.startDate, det.endDate, name, `${ev.uid}@${next.toString()}`);
      if (touches(e)) out.push(e);
    }
  }
  return { name, events: out };
}

export type CalendarResult = { events: CalEvent[]; errors: string[] };

export async function getCalendar(from: string, to: string): Promise<CalendarResult> {
  const sources = calendarSources();
  const results = await Promise.all(
    sources.map(async (src, i) => {
      try {
        const res = await fetch(src.url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return { events: [] as CalEvent[], error: `${src.name ?? `Agenda ${i + 1}`}: HTTP ${res.status}` };
        const { events } = parseIcs(await res.text(), src.name ?? "", from, to);
        return { events, error: null };
      } catch (err) {
        return { events: [] as CalEvent[], error: `${src.name ?? `Agenda ${i + 1}`}: ${(err as Error).message}` };
      }
    }),
  );
  const events = results.flatMap((r) => r.events);
  // O mesmo evento pode estar em duas agendas (convite aceito nas duas).
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const k = `${e.title}|${e.date}|${e.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMs - b.startMs);
  return { events: unique, errors: results.flatMap((r) => (r.error ? [r.error] : [])) };
}
