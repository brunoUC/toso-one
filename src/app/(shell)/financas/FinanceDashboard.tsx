"use client";

import { useState } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { BarChart } from "@/components/charts/BarChart";
import { GoalMeter } from "@/components/charts/GoalMeter";
import { Heatmap } from "@/components/charts/Heatmap";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { StatTile } from "@/components/charts/StatTile";
import { DEMO_ALLOCATION, DEMO_GOALS, DEMO_SERIES, DEMO_TILES } from "@/lib/demo-finance";
import { brl } from "@/lib/format";

const RANGES = [
  { key: 6, label: "6M" },
  { key: 12, label: "1A" },
  { key: 24, label: "2A" },
  { key: 36, label: "Tudo" },
];

// Vitrine das visualizações com dados de EXEMPLO. Quando a carteira real
// chegar (Convex), só a origem dos dados muda; os componentes ficam.
export function FinanceDashboard() {
  const [range, setRange] = useState(12);
  const series = DEMO_SERIES;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const yearAgo = series[series.length - 13];
  const last12 = series.slice(-12);
  const avgContribution = last12.reduce((s, d) => s + d.contribution, 0) / 12;
  const monthGain = last.netWorth - prev.netWorth;
  const [whole, cents] = last.netWorth.toFixed(2).split(".");

  return (
    <>
      <div className="fin-head rise">
        <div>
          <p className="hero-label">
            Patrimônio total <span className="sample">dados de exemplo</span>
          </p>
          <p className="hero-figure">
            R$ {Number(whole).toLocaleString("pt-BR")}
            <span className="cents">,{cents}</span>
          </p>
          <div className="hero-delta">
            <span className={monthGain >= 0 ? "up" : "down"}>
              {monthGain >= 0 ? "↑" : "↓"} {brl(Math.abs(monthGain))} (
              {((monthGain / prev.netWorth) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%) no mês
            </span>
            <span>
              ↑ {(((last.netWorth - yearAgo.netWorth) / yearAgo.netWorth) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em
              12 meses
            </span>
          </div>
        </div>
        <div className="seg" role="group" aria-label="Período do gráfico">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid">
        <div className="card span-8 rise">
          <div className="card-title">
            <h3>Evolução do patrimônio</h3>
            <div className="legend">
              <span>
                <i style={{ background: "var(--s1)" }} />
                Patrimônio
              </span>
              <span>
                <i style={{ background: "var(--ink-3)" }} />
                Total aportado
              </span>
            </div>
          </div>
          <p className="card-sub">A distância entre as linhas é o que o dinheiro rendeu sozinho.</p>
          <NetWorthChart data={series.slice(-range)} />
        </div>

        <div className="card span-4 rise">
          <div className="card-title">
            <h3>Alocação</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              atual vs alvo
            </span>
          </div>
          <AllocationBar slices={DEMO_ALLOCATION} total={last.netWorth} />
        </div>

        <StatTile
          label="Aporte do mês"
          value={brl(last.contribution)}
          delta={`${last.contribution >= avgContribution ? "↑" : "↓"} ${Math.abs(Math.round((last.contribution / avgContribution - 1) * 100))}% vs média`}
          good={last.contribution >= avgContribution}
          trend={last12.map((d) => d.contribution)}
        />
        <StatTile
          label="Rendimento do mês"
          value={brl(monthGain - last.contribution)}
          delta={`${last.monthlyReturn >= 0 ? "↑" : "↓"} ${Math.abs(last.monthlyReturn * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          good={last.monthlyReturn >= 0}
          trend={last12.map((d) => d.monthlyReturn)}
        />
        <StatTile label="Taxa de poupança" value="34%" delta="↓ 3 pp vs 12m" good={false} trend={DEMO_TILES.savingsRate} />
        <StatTile label="Renda passiva / mês" value={brl(7980)} delta="↑ R$ 410" good trend={DEMO_TILES.passiveIncome} />

        <div className="card span-6">
          <div className="card-title">
            <h3>Aportes mensais</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              média {brl(avgContribution)}
            </span>
          </div>
          <p className="card-sub">Últimos 12 meses</p>
          <BarChart name="Aporte" max={20000} data={last12.map((d) => ({ label: d.label, value: d.contribution }))} />
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Metas</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              traço = onde deveria estar hoje
            </span>
          </div>
          <p className="card-sub">&nbsp;</p>
          {DEMO_GOALS.map((g) => (
            <GoalMeter key={g.name} {...g} />
          ))}
        </div>

        <div className="card span-8">
          <Heatmap
            years={[2024, 2025, 2026]}
            cells={series.map((d) => ({ year: d.year, month: d.month, value: d.monthlyReturn }))}
          />
        </div>

        <div className="card span-4">
          <div className="card-title">
            <h3>Insights</h3>
          </div>
          <p className="card-sub">Gerados a partir da carteira</p>
          <ul className="insights">
            <li>
              <span className="ic">↗</span>
              <span>
                <b>Exterior está 4 pp acima do alvo.</b> Direcionar os próximos 2 aportes para renda fixa rebalanceia sem vender.
              </span>
            </li>
            <li>
              <span className="ic">◎</span>
              <span>
                <b>Rendimento passou os aportes</b> pela primeira vez em set/2026: os juros já trabalham mais que o salário.
              </span>
            </li>
            <li>
              <span className="ic">!</span>
              <span>
                <b>Meta da viagem atrasou.</b> R$ 2.100/mês até maio fecha a diferença.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
