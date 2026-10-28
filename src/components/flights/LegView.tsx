import { dayLong, layover, stopsText } from "@/lib/flight-format";
import type { Leg } from "@/lib/flights";

// Um trecho (ida ou volta) com data, horários, duração, conexões e números
// dos voos. Sem detalhe, mostra só a data e a nota.
export function LegView({
  kind,
  date,
  leg,
  fromLabel,
  toLabel,
  note,
}: {
  kind: "ida" | "volta";
  date: string;
  leg: Leg | null | undefined;
  fromLabel?: string;
  toLabel?: string;
  note?: string;
}) {
  const connections = leg
    ? leg.flights.slice(1).map((f, i) => {
        const wait = layover(leg.flights[i].arr, f.dep);
        return `${f.from}${wait ? ` (${wait})` : ""}`;
      })
    : [];
  return (
    <div className="leg">
      <span className="leg-k">{kind}</span>
      <div className="leg-date">{dayLong(date)}</div>
      {leg && leg.departTime && leg.arriveTime ? (
        <>
          <div className="leg-line">
            <div className="leg-end">
              <b>{leg.departTime}</b>
              <span>
                {leg.from}
                {fromLabel ? ` · ${fromLabel}` : ""}
              </span>
            </div>
            <div className="leg-path">
              <span>{leg.duration ?? ""}</span>
              <i />
              <span>{stopsText(leg.stops) ?? ""}</span>
            </div>
            <div className="leg-end right">
              <b>
                {leg.arriveTime}
                {leg.arriveAhead ? <sup>+{leg.arriveAhead}</sup> : null}
              </b>
              <span>
                {leg.to}
                {toLabel ? ` · ${toLabel}` : ""}
              </span>
            </div>
          </div>
          <div className="leg-meta">
            {leg.airline ?? "companhia não informada"}
            {leg.flights.length > 0 && <span className="mono"> · {leg.flights.map((f) => f.no).join(" + ")}</span>}
            {connections.length > 0 && <> · conexão em {connections.join(", ")}</>}
          </div>
        </>
      ) : (
        note && <div className="leg-meta">{note}</div>
      )}
    </div>
  );
}
