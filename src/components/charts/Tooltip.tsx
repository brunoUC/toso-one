export type TipRow = { name: string; color: string; value: string };
export type TipState = { x: number; y: number; title: string; rows: TipRow[] } | null;

// Valor em destaque, nome em segundo plano; chave da série como traço curto.
export function Tooltip({ tip, width }: { tip: TipState; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 84), width - 84);
  return (
    <div className="tip" style={{ left, top: tip.y, opacity: 1 }} role="status">
      <div className="t">{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="r" key={r.name}>
          <span>
            <i style={{ background: r.color }} />
            {r.name}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}
