"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { Tooltip, type TipState } from "./Tooltip";
import { useWidth } from "./useWidth";

type Month = { label: string; income: number; expense: number; partial?: boolean };

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((k) => k * p >= v) ?? 10) * p;
}

// Entradas (azul) e gastos (âmbar) lado a lado por mês, um eixo só. O par
// passou no validador de daltonismo nos dois temas. 2px de superfície entre
// as barras do par; o mês corrente fica mais claro (ainda está correndo).
export function FlowChart({ data }: { data: Month[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const [hover, setHover] = useState<number | null>(null);

  const H = 230;
  const P = { t: 14, r: 4, b: 26, l: 48 };
  const max = niceMax(Math.max(...data.flatMap((d) => [d.income, d.expense])));
  const y = (v: number) => P.t + (1 - Math.max(0, v) / max) * (H - P.t - P.b);
  const band = (W - P.l - P.r) / data.length;
  const bw = Math.max(3, Math.min(14, band * 0.32));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(v)));

  const bar = (x: number, v: number, color: string, faded: boolean) => {
    const top = y(v);
    const base = y(0);
    const r = Math.min(4, (base - top) / 2);
    return (
      <path
        d={`M${x} ${base}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${base}Z`}
        style={{ fill: color, opacity: faded ? 0.55 : 1 }}
      />
    );
  };

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Entradas e gastos por mês">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} style={{ stroke: v ? "var(--grid)" : "var(--axis)" }} />
            <text className="axis-label" x={P.l - 10} y={y(v) + 4} textAnchor="end">
              {v ? fmt(v) : "0"}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = P.l + band * (i + 0.5);
          const faded = Boolean(d.partial) || (hover !== null && hover !== i);
          const show = () => {
            setHover(i);
            setTip({
              x: cx,
              y: y(Math.max(d.income, d.expense)) - 6,
              title: d.partial ? `${d.label} · até hoje` : d.label,
              rows: [
                { name: "Entradas", color: "var(--s1)", value: brl(d.income) },
                { name: "Gastos", color: "var(--s2)", value: brl(d.expense) },
                { name: "Sobrou", color: "transparent", value: brl(d.income - d.expense) },
              ],
            });
          };
          const hide = () => {
            setHover(null);
            setTip(null);
          };
          return (
            <g key={d.label}>
              {bar(cx - bw - 1, d.income, "var(--s1)", faded)}
              {bar(cx + 1, d.expense, "var(--s2)", faded)}
              <text className="axis-label" x={cx} y={H - 6} textAnchor="middle">
                {d.label.split("/")[0]}
              </text>
              <rect
                x={cx - band / 2}
                y={P.t}
                width={band}
                height={H - P.t - P.b}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: entradas ${brl(d.income)}, gastos ${brl(d.expense)}`}
                onPointerEnter={show}
                onFocus={show}
                onPointerLeave={hide}
                onBlur={hide}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={W} />
    </div>
  );
}
