import { compact } from "@/lib/format";

type Slice = { name: string; slot: number; pct: number; target?: number; value?: number };

// Parte-do-todo numa barra empilhada (gap de 2px entre fatias) + lista com
// valor e desvio do alvo. Desvio de 3 pp ou mais ganha destaque.
export function AllocationBar({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <>
      <div className="alloc-bar" role="img" aria-label={slices.map((s) => `${s.name} ${s.pct}%`).join(", ")}>
        {slices.map((s) => (
          <div key={s.name} title={`${s.name} · ${s.pct}%`} style={{ flex: s.pct, background: `var(--s${s.slot})` }} />
        ))}
      </div>
      <ul className="alloc-list">
        {slices.map((s) => {
          const diff = s.target === undefined ? null : s.pct - s.target;
          return (
            <li key={s.name}>
              <span className="nm">
                <i style={{ background: `var(--s${s.slot})` }} />
                {s.name}
              </span>
              <span className="pct">
                {s.pct}% · {compact(s.value ?? (total * s.pct) / 100)}
              </span>
              {diff !== null ? (
                <span className="vs" style={Math.abs(diff) >= 3 ? { color: "var(--sand)" } : undefined}>
                  {diff === 0 ? "no alvo" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} pp`}
                </span>
              ) : (
                <span className="vs" />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
