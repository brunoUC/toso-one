import { STATUS_LABEL, fareStatus, type Targets } from "@/lib/fare-status";
import { SOURCE_NAME, brl, stopsText } from "@/lib/flight-format";
import type { Leg, Trip } from "@/lib/flights";

const COLOR = { below: "var(--up)", between: "var(--sand)", above: "var(--down)", none: "var(--ink-3)" } as const;

function LegLine({ kind, leg }: { kind: string; leg: Leg }) {
  return (
    <div className="trip-leg">
      <span className="trip-k">{kind}</span>
      <span className="trip-times">
        {leg.departTime} {leg.from} → {leg.arriveTime}
        {leg.arriveAhead ? <sup>+{leg.arriveAhead}</sup> : null} {leg.to}
      </span>
      <span className="trip-meta">
        {[leg.airline, stopsText(leg.stops), leg.duration].filter(Boolean).join(" · ")}
        {leg.flights.length > 0 && <span className="mono"> · {leg.flights.map((f) => f.no).join(" + ")}</span>}
      </span>
    </div>
  );
}

// Itinerários de ida e volta (preço total), cada um com os dois trechos.
export function TripList({ trips, targets, limit }: { trips: Trip[]; targets: Targets; limit?: number }) {
  const multiSource = new Set(trips.map((t) => t.source)).size > 1;
  return (
    <ul className="trip-list">
      {(limit ? trips.slice(0, limit) : trips).map((t, i) => {
        const s = fareStatus(t.price, targets);
        return (
          <li key={i}>
            <div className="trip-price">
              <b style={{ color: COLOR[s] }}>{brl(t.price)}</b>
              <span style={{ color: COLOR[s] }}>{STATUS_LABEL[s]}</span>
              {multiSource && <span className="fx-muted">{SOURCE_NAME[t.source] ?? t.source}</span>}
            </div>
            <LegLine kind="ida" leg={t.out} />
            <LegLine kind="volta" leg={t.back} />
          </li>
        );
      })}
    </ul>
  );
}
