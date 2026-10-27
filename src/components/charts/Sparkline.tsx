// Tendência de 12 pontos no tom de apoio; o ponto atual leva a cor de destaque.
export function Sparkline({ values, width = 72, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => [2 + (i * (width - 6)) / (values.length - 1), 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path
        d={pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("")}
        style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: 1.5, strokeLinejoin: "round" }}
      />
      <circle cx={lx} cy={ly} r={3} style={{ fill: "var(--s1)", stroke: "var(--surface-1)", strokeWidth: 1.5 }} />
    </svg>
  );
}
