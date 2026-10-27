"use client";

import { useState } from "react";
import { Tooltip, type TipState } from "@/components/charts/Tooltip";
import { useWidth } from "@/components/charts/useWidth";

const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const short = (v: number) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
const label = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

// Menor preço de cada dia de coleta, com o alvo e o teto como linhas de
// referência no mesmo eixo.
export function PriceHistory({ series, target, ceiling }: { series: { day: string; price: number }[]; target: number; ceiling: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<TipState>(null);
  const H = 220;
  const P = { t: 14, r: 70, b: 26, l: 56 };
  const values = series.map((s) => s.price);
  // Escala com números redondos (passos de 1, 2 ou 5 mil) para os rótulos.
  const rawLo = Math.min(...values, target) * 0.97;
  const rawHi = Math.max(...values, ceiling) * 1.02;
  const step = [1000, 2000, 2500, 5000, 10000].find((s) => (rawHi - rawLo) / s <= 5) ?? 20000;
  const lo = Math.floor(rawLo / step) * step;
  const hi = Math.ceil(rawHi / step) * step;
  const x = (i: number) => P.l + (i / Math.max(1, series.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const path = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s.price).toFixed(1)}`).join("");
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const every = Math.ceil(series.length / Math.max(2, Math.floor((W - P.l - P.r) / 70)));
  const last = series.length - 1;

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Histórico do menor preço por dia">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} style={{ stroke: "var(--grid)" }} />
            <text className="axis-label" x={P.l - 10} y={y(v) + 4} textAnchor="end">
              {short(v)}
            </text>
          </g>
        ))}
        {series.map((s, i) =>
          (last - i) % every ? null : (
            <text key={s.day} className="axis-label" x={x(i)} y={H - 6} textAnchor="middle">
              {label(s.day)}
            </text>
          ),
        )}
        {[
          { v: ceiling, name: "teto", color: "var(--ink-3)" },
          { v: target, name: "alvo", color: "var(--sand)" },
        ].map((r) => (
          <g key={r.name}>
            <line x1={P.l} x2={W - P.r} y1={y(r.v)} y2={y(r.v)} style={{ stroke: r.color, strokeWidth: 1.2 }} />
            <text x={W - P.r + 8} y={y(r.v) + 4} style={{ fill: "var(--ink-2)", fontSize: 11 }}>
              {r.name}
            </text>
          </g>
        ))}
        <path d={path} style={{ fill: "none", stroke: "var(--tone-sky)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }} />
        <circle cx={x(last)} cy={y(values[last])} r={4} style={{ fill: "var(--tone-sky)", stroke: "var(--surface-1)", strokeWidth: 2 }} />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} style={{ stroke: "var(--axis)" }} />
            <circle cx={x(hover)} cy={y(values[hover])} r={4} style={{ fill: "var(--tone-sky)", stroke: "var(--surface-1)", strokeWidth: 2 }} />
          </>
        )}
        <rect
          x={P.l}
          y={0}
          width={Math.max(0, W - P.l - P.r)}
          height={H}
          fill="transparent"
          onPointerMove={(e) => {
            const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const i = Math.max(0, Math.min(last, Math.round(((e.clientX - box.left - P.l) / (W - P.l - P.r)) * last)));
            setHover(i);
            setTip({ x: x(i), y: y(values[i]) - 8, title: label(series[i].day), rows: [{ name: "Menor do dia", color: "var(--tone-sky)", value: brl(values[i]) }] });
          }}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
        />
      </svg>
      <Tooltip tip={tip} width={W} />
    </div>
  );
}
