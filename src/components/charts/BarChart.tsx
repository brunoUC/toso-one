"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { Tooltip, type TipState } from "./Tooltip";
import { useWidth } from "./useWidth";

type Bar = { label: string; value: number };

// Colunas finas (≤24px), topo arredondado e base reta. O mês atual em cor
// cheia; rótulo direto só no atual e no maior.
export function BarChart({ data, name, max }: { data: Bar[]; name: string; max: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const [hover, setHover] = useState<number | null>(null);

  const H = 210;
  const P = { t: 18, r: 4, b: 26, l: 44 };
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const band = (W - P.l - P.r) / data.length;
  const bw = Math.min(24, band * 0.56);
  const maxI = data.reduce((a, d, i) => (d.value > data[a].value ? i : a), 0);
  const last = data.length - 1;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={name}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} style={{ stroke: v ? "var(--grid)" : "var(--axis)" }} />
            <text className="axis-label" x={P.l - 10} y={y(v) + 4} textAnchor="end">
              {v ? (max >= 4000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v)) : "0"}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = P.l + band * (i + 0.5);
          const top = y(d.value);
          const base = y(0);
          const r = 4;
          const l = cx - bw / 2;
          const rr = cx + bw / 2;
          const strong = i === last || i === hover;
          const show = () => {
            setHover(i);
            setTip({ x: cx, y: top - 6, title: d.label, rows: [{ name, color: "var(--s1)", value: brl(d.value) }] });
          };
          const hide = () => {
            setHover(null);
            setTip(null);
          };
          return (
            <g key={d.label}>
              <path
                d={`M${l} ${base}V${top + r}Q${l} ${top} ${l + r} ${top}H${rr - r}Q${rr} ${top} ${rr} ${top + r}V${base}Z`}
                style={{ fill: "var(--s1)", opacity: strong ? 1 : 0.5 }}
              />
              <text className="axis-label" x={cx} y={H - 6} textAnchor="middle">
                {d.label.split("/")[0]}
              </text>
              {(i === maxI || i === last) && (
                <text x={cx} y={top - 6} textAnchor="middle" style={{ fill: "var(--ink-2)", fontSize: 11 }}>
                  {(d.value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k
                </text>
              )}
              <rect
                x={cx - band / 2}
                y={P.t}
                width={band}
                height={H - P.t - P.b}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: ${brl(d.value)}`}
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
