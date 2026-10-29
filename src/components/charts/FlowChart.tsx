"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { Tooltip, type TipState } from "./Tooltip";
import { useWidth } from "./useWidth";

type Month = { label: string; income: number; expense: number; partial?: boolean };

// Passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ).
function niceStep(range: number, lines: number): number {
  const raw = Math.max(range, 1) / lines;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

const short = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 100_000 ? 0 : 1 })} mil` : String(Math.round(a));
  return v < 0 ? `−${s}` : v > 0 ? `+${s}` : "0";
};

// Fluxo do mês espelhado num eixo só (tudo em R$ por mês): entradas sobem
// do zero (azul), gastos descem (âmbar) e a linha é a variação patrimonial
// do mês (entradas − gastos). O par azul/âmbar passou no validador de
// daltonismo nos dois temas; a linha usa tinta neutra e tem legenda.
export function FlowChart({ data }: { data: Month[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const [hover, setHover] = useState<number | null>(null);

  const H = 300;
  const P = { t: 16, r: 8, b: 28, l: 56 };
  const net = data.map((d) => d.income - d.expense);
  const hi0 = Math.max(0, ...data.map((d) => d.income), ...net);
  const lo0 = Math.min(0, ...data.map((d) => -d.expense), ...net);
  const step = niceStep(hi0 - lo0, 6);
  const hi = Math.ceil(hi0 / step) * step || step;
  const lo = Math.floor(lo0 / step) * step;
  const y = (v: number) => P.t + ((hi - v) / (hi - lo)) * (H - P.t - P.b);
  const band = (W - P.l - P.r) / data.length;
  const bw = Math.max(6, Math.min(22, band * 0.42));
  const cx = (i: number) => P.l + band * (i + 0.5);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);

  // Último mês fechado e o de maior variação ganham rótulo direto.
  const lastClosed = data.map((d, i) => (d.partial ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  const best = net.reduce((a, v, i) => (v > net[a] ? i : a), 0);
  const labelled = new Set([lastClosed, best].filter((i) => i >= 0));

  const column = (i: number, v: number, up: boolean, color: string, faded: boolean) => {
    if (v <= 0) return null;
    const x = cx(i) - bw / 2;
    const base = y(0);
    const end = y(up ? v : -v);
    const h = Math.abs(base - end);
    const r = Math.min(4, h / 2);
    // Ponta arredondada só na extremidade do dado; a base fica reta no zero
    // (1px de folga para o traço do zero não encostar).
    const b0 = up ? base - 1 : base + 1;
    const d = up
      ? `M${x} ${b0}V${end + r}Q${x} ${end} ${x + r} ${end}H${x + bw - r}Q${x + bw} ${end} ${x + bw} ${end + r}V${b0}Z`
      : `M${x} ${b0}V${end - r}Q${x} ${end} ${x + r} ${end}H${x + bw - r}Q${x + bw} ${end} ${x + bw} ${end - r}V${b0}Z`;
    return <path d={d} style={{ fill: color, opacity: faded ? 0.45 : 1, transition: "opacity .15s" }} />;
  };

  const line = net.map((v, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Entradas, gastos e variação patrimonial por mês">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} style={{ stroke: v === 0 ? "var(--axis)" : "var(--grid)" }} />
            <text className="axis-label" x={P.l - 10} y={y(v) + 4} textAnchor="end">
              {short(v)}
            </text>
          </g>
        ))}

        {hover !== null && <rect x={cx(hover) - band / 2 + 2} y={P.t} width={band - 4} height={H - P.t - P.b} rx={6} style={{ fill: "var(--surface-2)" }} />}

        {data.map((d, i) => {
          const faded = Boolean(d.partial) || (hover !== null && hover !== i);
          return (
            <g key={d.label}>
              {column(i, d.income, true, "var(--s1)", faded)}
              {column(i, d.expense, false, "var(--s2)", faded)}
              <text className="axis-label" x={cx(i)} y={H - 8} textAnchor="middle" style={hover === i ? { fill: "var(--ink-1)" } : undefined}>
                {d.label.split("/")[0]}
                {d.partial ? "*" : ""}
              </text>
            </g>
          );
        })}

        <path d={line} style={{ fill: "none", stroke: "var(--ink-1)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }} />
        {net.map((v, i) => (
          <circle
            key={i}
            cx={cx(i)}
            cy={y(v)}
            r={hover === i ? 5 : 4}
            style={{ fill: data[i].partial ? "var(--surface-1)" : "var(--ink-1)", stroke: data[i].partial ? "var(--ink-1)" : "var(--surface-1)", strokeWidth: 2 }}
          />
        ))}
        {[...labelled].map((i) => {
          const above = net[i] >= 0;
          return (
            <text
              key={i}
              x={cx(i)}
              y={y(net[i]) + (above ? -12 : 20)}
              textAnchor={i === data.length - 1 ? "end" : "middle"}
              style={{ fill: "var(--ink-1)", fontSize: 11.5, fontWeight: 500, paintOrder: "stroke", stroke: "var(--surface-1)", strokeWidth: 4 }}
            >
              {short(net[i])}
            </text>
          );
        })}

        {data.map((d, i) => {
          const show = () => {
            setHover(i);
            setTip({
              x: cx(i),
              y: Math.min(y(Math.max(d.income, net[i])), y(0)) - 10,
              title: d.partial ? `${d.label} · até hoje` : d.label,
              rows: [
                { name: "Entradas", color: "var(--s1)", value: brl(d.income) },
                { name: "Gastos", color: "var(--s2)", value: brl(d.expense) },
                { name: "Variação", color: "var(--ink-1)", value: `${net[i] >= 0 ? "+" : "−"}${brl(Math.abs(net[i]))}` },
              ],
            });
          };
          const hide = () => {
            setHover(null);
            setTip(null);
          };
          return (
            <rect
              key={d.label}
              x={cx(i) - band / 2}
              y={P.t}
              width={band}
              height={H - P.t - P.b}
              fill="transparent"
              tabIndex={0}
              aria-label={`${d.label}: entradas ${brl(d.income)}, gastos ${brl(d.expense)}, variação ${brl(net[i])}`}
              onPointerEnter={show}
              onFocus={show}
              onPointerLeave={hide}
              onBlur={hide}
            />
          );
        })}
      </svg>
      <Tooltip tip={tip} width={W} />
    </div>
  );
}
