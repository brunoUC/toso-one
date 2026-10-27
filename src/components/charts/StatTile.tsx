import { Sparkline } from "./Sparkline";

export function StatTile({
  label,
  value,
  delta,
  good,
  trend,
}: {
  label: string;
  value: string;
  delta: string;
  good: boolean;
  trend: number[];
}) {
  return (
    <div className="card tile span-3">
      <div className="label">{label}</div>
      <div className="row">
        <div>
          <div className="value">{value}</div>
          <div className={`delta ${good ? "up" : "down"}`}>{delta}</div>
        </div>
        <Sparkline values={trend} />
      </div>
    </div>
  );
}
