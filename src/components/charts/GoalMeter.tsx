import { compact } from "@/lib/format";

// Medidor de meta: trilho num tom claro da mesma rampa; o traço marca onde o
// valor deveria estar hoje para cumprir o prazo.
export function GoalMeter({
  name,
  current,
  target,
  pace,
  foot,
}: {
  name: string;
  current: number;
  target: number;
  pace: number | null;
  foot: { good: boolean; text: string; rest: string };
}) {
  const ratio = Math.min(1, current / target);
  return (
    <div className="goal">
      <div className="goal-top">
        {name}
        <span>
          R$ {compact(current)} / R$ {compact(target)}
        </span>
      </div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={current} aria-label={name}>
        <div style={{ width: `${ratio * 100}%` }} />
        {pace !== null && <span className="pace" style={{ left: `${pace * 100}%` }} />}
      </div>
      <div className="goal-foot">
        {foot.text && <span className={foot.good ? "up" : "down"}>{foot.text}</span>}
        {foot.text && " · "}
        {foot.rest}
      </div>
    </div>
  );
}
