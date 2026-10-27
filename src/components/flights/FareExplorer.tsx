"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

type Fare = {
  price: number;
  departDate: string;
  returnDate: string | null;
  airline: string | null;
  stops: number | null;
  duration: string | null;
  departTime: string | null;
  arriveTime: string | null;
  arriveAhead: number;
  googleLevel: string | null;
  bookingUrl: string;
  seenOn: string;
};

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const k = (v: number) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => {
  const d = utc(s);
  return `${WD[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const seen = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
const stays = (f: Fare) => (f.returnDate ? Math.round((Date.parse(f.returnDate) - Date.parse(f.departDate)) / 86_400_000) : null);
const stopsTxt = (n: number | null) => (n === null ? null : n === 0 ? "direto" : n === 1 ? "1 conexão" : `${n} conexões`);

function Times({ fare, origin, destination }: { fare: Fare; origin: string; destination: string }) {
  if (!fare.departTime || !fare.arriveTime) return <span className="fx-muted">horário: veja no Google Flights</span>;
  return (
    <span className="fx-times">
      {fare.departTime} {origin} → {fare.arriveTime}
      {fare.arriveAhead ? <sup>+{fare.arriveAhead}</sup> : null} {destination}
    </span>
  );
}

// Calendário de preço por dia de ida (o menor preço visto para cada data),
// lista das voltas do dia escolhido e tabela com tudo o que já foi visto.
export function FareExplorer({
  fares,
  window,
  initialDay,
  origin,
  destination,
  target,
}: {
  fares: Fare[];
  window: [string, string];
  initialDay: string | null;
  origin: string;
  destination: string;
  target: number;
}) {
  const [selected, setSelected] = useState<string | null>(initialDay);
  const [sort, setSort] = useState<"price" | "date">("price");
  const [all, setAll] = useState(false);
  const LIMIT = 12;

  const byDay = useMemo(() => {
    const map = new Map<string, Fare[]>();
    for (const f of fares) map.set(f.departDate, [...(map.get(f.departDate) ?? []), f]);
    for (const list of map.values()) list.sort((a, b) => a.price - b.price);
    return map;
  }, [fares]);

  const prices = fares.map((f) => f.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  // Cor = quão barato é o melhor preço do dia dentro da faixa vista (verde
  // mais forte = mais barato). O valor está sempre escrito na célula.
  const shade = (p: number) => {
    const t = hi === lo ? 1 : 1 - (p - lo) / (hi - lo);
    return `color-mix(in srgb, var(--tone-emerald) ${Math.round(12 + t * 58)}%, var(--surface-1))`;
  };

  const months = useMemo(() => {
    const out: { y: number; m: number }[] = [];
    const a = utc(window[0]);
    const b = utc(window[1]);
    for (let d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)); d <= b; d.setUTCMonth(d.getUTCMonth() + 1)) {
      out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    }
    return out.slice(0, 4);
  }, [window]);

  const dayFares = selected ? byDay.get(selected) ?? [] : [];
  const sorted = [...fares].sort((a, b) =>
    sort === "price" ? a.price - b.price : a.departDate.localeCompare(b.departDate) || (a.returnDate ?? "").localeCompare(b.returnDate ?? ""),
  );

  return (
    <div className="fx">
      <div className="fx-cal-wrap">
        {months.map(({ y, m }) => {
          const first = new Date(Date.UTC(y, m, 1));
          const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
          for (let i = 1; i <= days; i++) cells.push(iso(new Date(Date.UTC(y, m, i))));
          return (
            <div key={`${y}-${m}`} className="fx-month">
              <div className="fx-month-title">
                {MONTHS[m]} {y}
              </div>
              <div className="fx-grid" role="grid">
                {WD.map((w) => (
                  <span key={w} className="fx-wd">
                    {w[0].toUpperCase()}
                  </span>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <span key={`e${i}`} />;
                  const inWindow = d >= window[0] && d <= window[1];
                  const list = byDay.get(d);
                  const best = list?.[0];
                  const isMin = best && best.price === lo;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`fx-day${best ? " has" : ""}${inWindow ? "" : " out"}${selected === d ? " on" : ""}${isMin ? " min" : ""}`}
                      style={best ? { background: shade(best.price) } : undefined}
                      disabled={!best}
                      onClick={() => setSelected(d)}
                      aria-label={best ? `${day(d)}: a partir de ${brl(best.price)}` : `${day(d)}: sem preço`}
                      aria-pressed={selected === d}
                    >
                      <span className="n">{Number(d.slice(8))}</span>
                      {best && <span className="p">{k(best.price)}</span>}
                      {best && best.price <= target && <span className="t" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="fx-legend">
          <span>mais barato</span>
          <span className="fx-ramp" />
          <span>mais caro</span>
          <span className="fx-legend-t">
            <span className="t" /> abaixo do alvo
          </span>
          <span>· sem cor = ainda não consultado</span>
        </div>
      </div>

      <div className="fx-day-panel">
        {selected && dayFares.length > 0 ? (
          <>
            <div className="fx-panel-title">
              <span className="eyebrow" style={{ margin: 0 }}>
                ida
              </span>
              <h3>{day(selected)}</h3>
              <span className="fx-muted">
                {dayFares.length} volta{dayFares.length === 1 ? "" : "s"} consultada{dayFares.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="fx-returns">
              {dayFares.map((f) => (
                <li key={`${f.departDate}-${f.returnDate}`}>
                  <div className="fx-ret-main">
                    <b>{brl(f.price)}</b>
                    <span>
                      volta {f.returnDate ? day(f.returnDate) : "—"}
                      {stays(f) !== null ? ` · ${stays(f)} dias` : ""}
                    </span>
                  </div>
                  <div className="fx-ret-meta">
                    <Times fare={f} origin={origin} destination={destination} />
                    <span>{[f.airline, stopsTxt(f.stops), f.duration].filter(Boolean).join(" · ")}</span>
                    {f.googleLevel && <span className={`fx-level ${f.googleLevel}`}>Google: preço {f.googleLevel}</span>}
                    <span className="fx-muted">visto em {seen(f.seenOn)}</span>
                  </div>
                  <a className="btn btn-ghost btn-sm" href={f.bookingUrl} target="_blank" rel="noopener noreferrer">
                    Conferir <Icon name="external" size={13} />
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="fx-muted" style={{ margin: 0 }}>
            Escolha um dia com cor no calendário para ver as voltas consultadas e o preço de cada uma.
          </p>
        )}
      </div>

      <div className="fx-table-wrap">
        <div className="card-title">
          <h3>Todas as tarifas vistas</h3>
          <div className="seg" role="group" aria-label="Ordenar">
            <button type="button" aria-pressed={sort === "price"} onClick={() => setSort("price")}>
              preço
            </button>
            <button type="button" aria-pressed={sort === "date"} onClick={() => setSort("date")}>
              data
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table fx-table">
            <thead>
              <tr>
                <th>Ida</th>
                <th>Volta</th>
                <th>Dias</th>
                <th>Horário da ida</th>
                <th>Companhia</th>
                <th>Preço</th>
                <th>Visto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(all ? sorted : sorted.slice(0, LIMIT)).map((f) => (
                <tr key={`${f.departDate}-${f.returnDate}`} className={f.price <= target ? "below" : undefined}>
                  <td>{day(f.departDate)}</td>
                  <td>{f.returnDate ? day(f.returnDate) : "—"}</td>
                  <td>{stays(f) ?? "—"}</td>
                  <td>{f.departTime && f.arriveTime ? `${f.departTime} → ${f.arriveTime}${f.arriveAhead ? ` +${f.arriveAhead}` : ""}` : "—"}</td>
                  <td>{[f.airline, stopsTxt(f.stops)].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <b>{brl(f.price)}</b>
                  </td>
                  <td>{seen(f.seenOn)}</td>
                  <td>
                    <a href={f.bookingUrl} target="_blank" rel="noopener noreferrer" aria-label="Conferir no Google Flights">
                      <Icon name="external" size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > LIMIT && (
          <p className="form-note" style={{ textAlign: "center" }}>
            <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
              {all ? "mostrar menos" : `mostrar todas as ${sorted.length}`}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
