"use client";

import { useId, useState } from "react";
import { brl, compact } from "@/lib/format";
import { Tooltip, type TipState } from "./Tooltip";
import { useWidth } from "./useWidth";

type Point = { label: string; netWorth: number; invested?: number; estimated?: boolean };

// Passo "redondo" (1, 2 ou 5 × 10ⁿ) para umas 4 linhas de grade.
function niceStep(range: number): number {
  const raw = Math.max(range, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

// Patrimônio (série principal, com área) contra total aportado (tinta de
// apoio). Um eixo só; rótulos diretos no fim; crosshair que encaixa no mês.
export function NetWorthChart({ data, name = "Patrimônio" }: { data: Point[]; name?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();

  const H = 260;
  const P = { t: 12, r: 64, b: 26, l: 52 };
  // A segunda linha (aportado) é opcional; pontos estimados vêm marcados.
  const hasSecond = data.every((d) => d.invested !== undefined);
  const values = data.flatMap((d) => (hasSecond ? [d.netWorth, d.invested!] : [d.netWorth]));
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = (hi0 - lo0 || Math.abs(hi0) || 1) * 0.06;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const step = niceStep(hi - lo);
  const y0 = Math.floor(lo / step) * step;
  const x = (i: number) => P.l + (i / Math.max(1, data.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - y0) / (hi - y0)) * (H - P.t - P.b);
  const line = (k: "netWorth" | "invested") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d[k] ?? 0).toFixed(1)}`).join("");

  const ticks: number[] = [];
  for (let v = y0; v <= hi; v += step) ticks.push(v);
  const every = Math.ceil(data.length / Math.max(2, Math.min(6, Math.floor((W - P.l - P.r) / 80))));
  const last = data.length - 1;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = Math.max(0, Math.min(last, Math.round(((px - P.l) / (W - P.l - P.r)) * last)));
    const d = data[i];
    setHover(i);
    setTip({
      x: x(i),
      y: y(d.netWorth) - 8,
      title: d.estimated ? `${d.label} · estimativa` : d.label,
      rows: hasSecond
        ? [
            { name: "Patrimônio", color: "var(--s1)", value: brl(d.netWorth) },
            { name: "Aportado", color: "var(--ink-3)", value: brl(d.invested!) },
            { name: "Rendeu", color: "transparent", value: brl(d.netWorth - d.invested!) },
          ]
        : [{ name, color: "var(--s1)", value: brl(d.netWorth) }],
    });
  }

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Evolução do patrimônio contra o total aportado">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--s1)", stopOpacity: 0.2 }} />
            <stop offset="1" style={{ stopColor: "var(--s1)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} style={{ stroke: "var(--grid)" }} />
            <text className="axis-label" x={P.l - 10} y={y(v) + 4} textAnchor="end">
              {compact(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          (last - i) % every ? null : (
            <text key={d.label} className="axis-label" x={x(i)} y={H - 6} textAnchor="middle">
              {d.label}
            </text>
          ),
        )}
        <path d={`${line("netWorth")}L${x(last)} ${H - P.b}L${x(0)} ${H - P.b}Z`} fill={`url(#${gradId})`} />
        {hasSecond && <path d={line("invested")} style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: 1.5, strokeLinejoin: "round" }} />}
        <path d={line("netWorth")} style={{ fill: "none", stroke: "var(--s1)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }} />

        <circle cx={x(last)} cy={y(data[last].netWorth)} r={4} style={{ fill: "var(--s1)", stroke: "var(--surface-1)", strokeWidth: 2 }} />
        <text x={x(last) + 10} y={y(data[last].netWorth) + 4} style={{ fill: "var(--ink-1)", fontSize: 12, fontWeight: 500 }}>
          {compact(data[last].netWorth)}
        </text>
        {hasSecond && (
          <text x={x(last) + 10} y={y(data[last].invested!) + 4} style={{ fill: "var(--ink-3)", fontSize: 12 }}>
            {compact(data[last].invested!)}
          </text>
        )}

        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} style={{ stroke: "var(--axis)" }} />
            <circle cx={x(hover)} cy={y(data[hover].netWorth)} r={4} style={{ fill: "var(--s1)", stroke: "var(--surface-1)", strokeWidth: 2 }} />
          </>
        )}
        <rect
          x={P.l}
          y={0}
          width={Math.max(0, W - P.l - P.r)}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
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
