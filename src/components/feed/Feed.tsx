import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getFeed, type FeedDay, type FeedItem, type Routine } from "@/lib/feed";
import { daysBetween, type UpcomingHoliday } from "@/lib/holidays";

// "Sua semana" na página inicial: hoje em destaque, os próximos seis dias,
// o próximo feriado e as rotinas. Renderiza no servidor, dentro de um
// Suspense, para os apps aparecerem antes.

const WD_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WD_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const dm = (d: string) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`;
const spanText = (from: string, to: string) =>
  from.slice(5, 7) === to.slice(5, 7) ? `${Number(from.slice(8, 10))}–${dm(to)}` : `${dm(from)} – ${dm(to)}`;

function dayName(d: FeedDay, today: string): string {
  const diff = daysBetween(today, d.date);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return WD_LONG[d.weekday].charAt(0).toUpperCase() + WD_LONG[d.weekday].slice(1);
}

function ItemRow({ it, compact }: { it: FeedItem; compact?: boolean }) {
  const when = it.time ? (it.end && it.end !== it.time && !compact ? `${it.time}–${it.end}` : it.time) : compact ? "" : "dia todo";
  const body = (
    <>
      {(!compact || when) && <span className="fi-time">{when}</span>}
      <span className="fi-ico">
        <Icon name={it.icon} size={compact ? 12 : 14} />
      </span>
      <span className="fi-text">
        <span className="fi-title">{it.title}</span>
        {it.sub && !compact && <span className="fi-sub">{it.sub}</span>}
      </span>
    </>
  );
  return (
    <li className="fi" data-kind={it.kind}>
      {it.href ? (
        <Link href={it.href} className="fi-link">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function Today({ day, feed }: { day: FeedDay; feed: Awaited<ReturnType<typeof getFeed>> }) {
  const w = feed.weather;
  return (
    <section className="today-card" aria-labelledby="hoje-h">
      <div className="today-head">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            {WD_LONG[day.weekday]} · {dm(day.date)}
          </p>
          <h3 id="hoje-h">Hoje</h3>
        </div>
        {w && (
          <div className="wx-now">
            <Icon name={w.now.icon} size={30} />
            <div>
              <span className="wx-temp">{w.now.temp}°</span>
              <span className="wx-label">
                {w.now.label}
                {day.weather ? ` · ${day.weather.min}°–${day.weather.max}°` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
      {w?.rainHint && (
        <p className="wx-hint">
          <Icon name="rain" size={14} />
          {w.rainHint}
        </p>
      )}
      {day.items.length ? (
        <ul className="fi-list">
          {day.items.map((it) => (
            <ItemRow key={it.key} it={it} />
          ))}
        </ul>
      ) : (
        <p className="feed-empty">Nada marcado para hoje.</p>
      )}
    </section>
  );
}

function Week({ days, today }: { days: FeedDay[]; today: string }) {
  return (
    <section className="week" aria-label="Próximos dias">
      {days.map((d) => (
        <div className={`wk-day${d.holiday ? " is-holiday" : ""}${d.weekday === 0 || d.weekday === 6 ? " is-weekend" : ""}`} key={d.date}>
          <div className="wk-date">
            <span className="wk-name">{dayName(d, today)}</span>
            <span className="wk-num">
              {WD_SHORT[d.weekday]} {dm(d.date)}
            </span>
            {d.weather && (
              <span className="wk-wx" title={`${d.weather.label}, chuva ${d.weather.rain}%`}>
                <Icon name={d.weather.icon} size={14} />
                {d.weather.max}°<small>{d.weather.min}°</small>
                {d.weather.rain >= 40 && <small className="wk-rain">{d.weather.rain}%</small>}
              </span>
            )}
          </div>
          {d.items.length ? (
            <ul className="fi-list compact">
              {d.items.map((it) => (
                <ItemRow key={it.key} it={it} compact />
              ))}
            </ul>
          ) : (
            <span className="wk-free">livre</span>
          )}
        </div>
      ))}
    </section>
  );
}

function HolidayCard({ list, personal }: { list: UpcomingHoliday[]; personal: boolean }) {
  // Destaque: o próximo que não cai no fim de semana.
  const main = list.find((h) => !h.weekend) ?? list[0];
  if (!main) return null;
  const rest = list.filter((h) => h !== main).slice(0, 2);
  const when = main.daysUntil === 0 ? "hoje" : main.daysUntil === 1 ? "amanhã" : `em ${main.daysUntil} dias`;
  return (
    <section className="side-card hol-card">
      <p className="eyebrow">Próximo feriado</p>
      <div className="hol-name">{main.name}</div>
      <div className="hol-when">
        {main.weekdayName}, {dm(main.date)} · <b>{when}</b>
      </div>
      {main.off.days >= 3 && (
        <p className="hol-note">
          <Icon name="party" size={14} />
          <span>
            Feriadão de <b>{main.off.days} dias</b> ({spanText(main.off.from, main.off.to)})
          </span>
        </p>
      )}
      {main.bridge && (
        <p className="hol-note">
          <Icon name="calendar" size={14} />
          <span>
            Emendando {WD_LONG[new Date(main.bridge.date + "T12:00:00Z").getUTCDay()]} ({dm(main.bridge.date)}), são <b>{main.bridge.days} dias</b> de folga
          </span>
        </p>
      )}
      {main.off.days >= 3 && personal && (
        <Link href="/voos" className="side-link">
          Ver tarifas de voos <Icon name="arrow" size={13} />
        </Link>
      )}
      {rest.length > 0 && (
        <ul className="hol-rest">
          {rest.map((h) => (
            <li key={h.date}>
              <span>{h.name}</span>
              <span className="muted">
                {WD_SHORT[new Date(h.date + "T12:00:00Z").getUTCDay()]} {dm(h.date)}
                {h.weekend ? " · fim de semana" : h.off.days >= 3 ? ` · ${h.off.days} dias` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoutinesCard({ routines }: { routines: Routine[] }) {
  return (
    <section className="side-card">
      <div className="side-head">
        <p className="eyebrow" style={{ margin: 0 }}>
          Rotinas
        </p>
        <Link href="/ajustes#rotinas" className="side-link">
          {routines.length ? "Editar" : "Criar"}
        </Link>
      </div>
      {routines.length ? (
        <ul className="rt-list">
          {routines.map((r) => (
            <li key={r.id}>
              <span className="rt-title">{r.title}</span>
              <span className="rt-days">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <span key={d} className={r.days.includes(d) ? "on" : undefined}>
                    {WD_SHORT[d].charAt(0).toUpperCase()}
                  </span>
                ))}
                {r.time && <span className="rt-time">{r.time}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="feed-empty small">O que se repete toda semana, como levar o Kobe na creche. Aparece nos dias certos e no resumo da manhã.</p>
      )}
    </section>
  );
}

function CalendarHint({ errors, configured }: { errors: string[]; configured: boolean }) {
  if (configured && !errors.length) return null;
  return (
    <section className="side-card hint-card">
      <p className="eyebrow">Google Calendar</p>
      {!configured ? (
        <p className="feed-empty small">
          Para a agenda aparecer aqui, copie o <b>endereço secreto no formato iCal</b> de cada agenda (Google Calendar → Configurações → a agenda → Integrar agenda) e
          cadastre em <code>GCAL_ICS</code> na Vercel.
        </p>
      ) : (
        <p className="feed-empty small">Não consegui ler: {errors.join("; ")}</p>
      )}
    </section>
  );
}

export async function Feed({ personal }: { personal: boolean }) {
  const feed = await getFeed({ personal });
  const [today, ...next] = feed.days;
  return (
    <div className="feed">
      <div className="feed-main">
        <Today day={today} feed={feed} />
        <Week days={next} today={feed.today} />
      </div>
      <aside className="feed-side">
        <HolidayCard list={feed.holidays} personal={personal} />
        {personal ? (
          <>
            <RoutinesCard routines={feed.routines} />
            <CalendarHint configured={feed.calendar.configured} errors={feed.calendar.errors} />
          </>
        ) : (
          <section className="side-card hint-card">
            <p className="feed-empty small">
              <Link href="/entrar?de=/">Entre</Link> para ver a agenda, as rotinas e as contas da semana.
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="feed" aria-busy="true">
      <div className="feed-main">
        <div className="today-card skeleton" style={{ height: 220 }} />
        <div className="week skeleton" style={{ height: 300 }} />
      </div>
      <aside className="feed-side">
        <div className="side-card skeleton" style={{ height: 180 }} />
      </aside>
    </div>
  );
}
