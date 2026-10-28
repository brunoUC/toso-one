"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { LegView } from "@/components/flights/LegView";
import { TripList } from "@/components/flights/TripList";
import { distanceText, fareStatus, type Targets } from "@/lib/fare-status";
import { SOURCE_NAME, addDays, brl, dayShort, daysBetween } from "@/lib/flight-format";
import type { Fare, Trip } from "@/lib/flights";

type Cell = Fare & { seenOn: string };
type Live = { state: "busy" } | { state: "ok"; trips: Trip[] } | { state: "failed"; error: string };

const COLOR = { below: "var(--up)", between: "var(--sand)", above: "var(--down)", none: "var(--ink-3)" } as const;
const num = (v: number) => Math.round(v).toLocaleString("pt-BR");
const seen = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

// Grade de datas no estilo do Google Flights: uma linha por dia de ida, uma
// coluna por permanência (8 a 12 dias), o preço de ida e volta em cada
// célula. Escolher uma célula mostra a ida e a volta daquele par.
export function DateGrid({
  fares,
  window: win,
  stay,
  origin,
  destination,
  originCity,
  destinationCity,
  targets,
  initial,
  signedIn,
}: {
  fares: Cell[];
  window: [string, string];
  stay: [number, number];
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  targets: Targets;
  initial: { depart: string; ret: string } | null;
  signedIn: boolean;
}) {
  const stays = useMemo(() => Array.from({ length: stay[1] - stay[0] + 1 }, (_, i) => stay[0] + i), [stay]);
  const byKey = useMemo(() => new Map(fares.map((f) => [`${f.departDate}|${f.returnDate}`, f])), [fares]);
  const departs = useMemo(() => {
    const out: string[] = [];
    for (let d = win[0]; d <= win[1]; d = addDays(d, 1)) out.push(d);
    return out;
  }, [win]);
  const cheapest = fares.length ? Math.min(...fares.map((f) => f.price)) : null;

  const [sel, setSel] = useState<string | null>(initial ? `${initial.depart}|${initial.ret}` : null);
  const [live, setLive] = useState<Record<string, Live>>({});
  const fare = sel ? byKey.get(sel) ?? null : null;
  const panel = useRef<HTMLDivElement>(null);

  function choose(key: string) {
    setSel(key);
    // No celular o painel fica embaixo da grade: leva até ele.
    if (window.matchMedia("(max-width: 980px)").matches) {
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function fetchTrips(f: Cell) {
    const key = `${f.departDate}|${f.returnDate}`;
    setLive((s) => ({ ...s, [key]: { state: "busy" } }));
    try {
      const res = await fetch("/api/voos/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, depart: f.departDate, return: f.returnDate }),
      });
      const data = await res.json().catch(() => ({}));
      setLive((s) => ({
        ...s,
        [key]: data.ok && data.trips?.length ? { state: "ok", trips: data.trips } : { state: "failed", error: data.error ?? "O Google não trouxe voos agora." },
      }));
    } catch {
      setLive((s) => ({ ...s, [key]: { state: "failed", error: "Sem conexão com o servidor." } }));
    }
  }

  const status = fare ? fareStatus(fare.price, targets) : "none";
  const l = sel ? live[sel] : undefined;

  return (
    <div className="dg">
      <div className="dg-scroll">
        <table className="dg-table">
          <caption className="sr-only">Preço de ida e volta por dia de ida e dias de viagem</caption>
          <thead>
            <tr>
              <th scope="col">ida</th>
              {stays.map((s) => (
                <th key={s} scope="col">
                  {s} dias
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departs.map((d) => {
              const row = stays.map((s) => byKey.get(`${d}|${addDays(d, s)}`) ?? null);
              const rowMin = Math.min(...row.filter(Boolean).map((f) => f!.price));
              return (
                <tr key={d}>
                  <th scope="row">{dayShort(d)}</th>
                  {row.map((f, i) => {
                    if (!f) {
                      return (
                        <td key={i}>
                          <span className="dg-empty" aria-label="sem preço">
                            —
                          </span>
                        </td>
                      );
                    }
                    const key = `${f.departDate}|${f.returnDate}`;
                    const s = fareStatus(f.price, targets);
                    return (
                      <td key={i}>
                        <button
                          type="button"
                          className={`dg-cell ${s}${sel === key ? " on" : ""}${f.price === cheapest ? " min" : ""}${f.price === rowMin ? " rmin" : ""}${f.back ? " det" : ""}`}
                          onClick={() => choose(key)}
                          aria-pressed={sel === key}
                          aria-label={`Ida ${dayShort(f.departDate)}, volta ${dayShort(f.returnDate!)}: ${brl(f.price)}`}
                        >
                          {num(f.price)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="dg-legend">
          <span>
            <i style={{ background: COLOR.below }} /> até o alvo
          </span>
          <span>
            <i style={{ background: COLOR.between }} /> até o teto
          </span>
          <span>
            <i style={{ background: COLOR.above }} /> acima do teto
          </span>
          <span>★ mais barato da grade</span>
          <span>
            <i className="det" /> voos de ida e volta já detalhados
          </span>
        </div>
      </div>

      <div className="dg-panel" aria-live="polite" ref={panel}>
        {fare && fare.returnDate ? (
          <>
            <p className="eyebrow" style={{ margin: 0 }}>
              ida e volta · executiva · 1 adulto
            </p>
            <h3 className="dg-title">
              {dayShort(fare.departDate)} → {dayShort(fare.returnDate)}
              <span>{daysBetween(fare.departDate, fare.returnDate)} dias</span>
            </h3>
            <div className="dg-price" style={{ color: COLOR[status] }}>
              {brl(fare.price)}
            </div>
            <p className="dg-dist" style={{ color: COLOR[status] }}>
              {distanceText(fare.price, targets)}
            </p>
            <p className="fx-muted">
              {fare.sources && Object.keys(fare.sources).length > 0
                ? Object.entries(fare.sources)
                    .map(([k, v]) => `${SOURCE_NAME[k] ?? k} ${brl(v)}`)
                    .join(" · ")
                : "preço total de ida e volta"}{" "}
              · visto em {seen(fare.seenOn)}
            </p>

            {fare.out && fare.back ? (
              <div className="dg-legs">
                <LegView kind="ida" date={fare.departDate} leg={fare.out} toLabel={destinationCity} fromLabel={originCity} />
                <LegView kind="volta" date={fare.returnDate} leg={fare.back} fromLabel={destinationCity} toLabel={originCity} />
              </div>
            ) : (
              !l && <p className="dg-nodetail">Os voos deste par ainda não foram detalhados pela coleta.</p>
            )}

            {l?.state === "ok" && (
              <>
                <p className="dg-sub">Agora, {l.trips.length} combinações de ida e volta:</p>
                <TripList trips={l.trips} targets={targets} limit={6} />
              </>
            )}
            {l?.state === "failed" && <p className="form-error">{l.error}</p>}

            <div className="dg-actions">
              {signedIn ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => fetchTrips(fare)} disabled={l?.state === "busy"}>
                  <Icon name="search" size={14} />
                  {l?.state === "busy" ? "Buscando ida e volta…" : fare.back ? "Atualizar voos agora" : "Ver voos de ida e volta agora"}
                </button>
              ) : (
                <Link className="btn btn-ghost btn-sm" href="/entrar?de=%2Fvoos">
                  <Icon name="lock" size={14} /> Entre para buscar os voos
                </Link>
              )}
              <a className="btn btn-primary btn-sm" href={fare.bookingUrl} target="_blank" rel="noopener noreferrer">
                Conferir no Google Flights <Icon name="external" size={14} />
              </a>
            </div>
          </>
        ) : (
          <p className="fx-muted" style={{ margin: 0 }}>
            Escolha um preço na grade para ver a ida e a volta daquele par.
          </p>
        )}
      </div>
    </div>
  );
}
