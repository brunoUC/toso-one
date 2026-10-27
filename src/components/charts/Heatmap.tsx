"use client";

import { Fragment, useState } from "react";
import { MONTHS } from "@/lib/demo-finance";
import { pct } from "@/lib/format";
import { Tooltip, type TipState } from "./Tooltip";
import { useWidth } from "./useWidth";

type Cell = { year: number; month: number; value: number };

// Divergente: azul para ganho, rosa para perda, cinza neutro no zero. A cor
// mistura os tokens do tema, então funciona no Claro e no Grafite.
function cellColor(v: number, limit: number) {
  const t = Math.max(-1, Math.min(1, v / limit));
  const pole = t < 0 ? "var(--heat-neg)" : "var(--heat-pos)";
  return `color-mix(in srgb, rgb(${pole}) ${Math.round(Math.abs(t) * 100)}%, rgb(var(--heat-mid)))`;
}

export function Heatmap({ cells, years, limit = 0.03 }: { cells: Cell[]; years: number[]; limit?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const [table, setTable] = useState(false);
  const find = (y: number, m: number) => cells.find((c) => c.year === y && c.month === m);

  return (
    <>
      <div className="card-title">
        <h3>Rentabilidade mensal</h3>
        <button className="table-toggle" type="button" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? "ver mapa" : "ver tabela"}
        </button>
      </div>
      <p className="card-sub">% sobre o patrimônio do início do mês</p>
      {table ? (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ano</th>
                {MONTHS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y}>
                  <td>{y}</td>
                  {MONTHS.map((_, m) => {
                    const c = find(y, m);
                    return <td key={m}>{c ? pct(c.value) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart" ref={ref}>
          <div className="heat">
            <span />
            {MONTHS.map((m) => (
              <span key={m} className="mh">
                {m[0].toUpperCase() + m.slice(1, 3)}
              </span>
            ))}
            {years.map((y) => (
              <Fragment key={y}>
                <span className="lbl">{y}</span>
                {MONTHS.map((m, mi) => {
                  const c = find(y, mi);
                  if (!c) return <div key={m} className="c" style={{ border: "1px dashed var(--hairline-strong)" }} />;
                  const show = (e: React.SyntheticEvent<HTMLDivElement>) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const box = ref.current!.getBoundingClientRect();
                    setTip({
                      x: r.left - box.left + r.width / 2,
                      y: r.top - box.top - 4,
                      title: `${m} ${y}`,
                      rows: [{ name: "Retorno", color: cellColor(c.value, limit), value: pct(c.value, 2) }],
                    });
                  };
                  return (
                    <div
                      key={m}
                      className="c"
                      tabIndex={0}
                      aria-label={`${m} ${y}: ${pct(c.value, 2)}`}
                      style={{ background: cellColor(c.value, limit) }}
                      onPointerEnter={show}
                      onFocus={show}
                      onPointerLeave={() => setTip(null)}
                      onBlur={() => setTip(null)}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
          <div className="scale">
            −{limit * 100}%<span className="ramp" />+{limit * 100}%
          </div>
          <Tooltip tip={tip} width={W} />
        </div>
      )}
    </>
  );
}
