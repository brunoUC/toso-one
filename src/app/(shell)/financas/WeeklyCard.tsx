"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { brl } from "@/lib/format";
import type { CardPlan, Weekly } from "@/lib/financas";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pct = (v: number, digits = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${brl(Math.abs(v))}`;

// Faturas que fecham nos próximos dias contra o saldo da conta do banco.
export function CardPlans({ plans }: { plans: CardPlan[] }) {
  if (!plans.length) return null;
  return (
    <ul className="fin-alerts">
      {plans.map((p) => (
        <li key={p.itemId + p.closeDate} className={p.transfer > 0 ? "bad" : undefined}>
          <b>{p.title}.</b> {p.text}
        </li>
      ))}
    </ul>
  );
}

// Semana na XP: os números da semana e a análise do Claude (sábado de manhã).
export function WeeklyCard({ weeks }: { weeks: Weekly[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latest = weeks.find((w) => w.status === "ok") ?? null;
  const running = weeks[0]?.status === "rodando" && Date.now() - weeks[0].startedAt < 15 * 60_000;
  const failed = weeks[0]?.status === "erro" ? weeks[0] : null;
  const older = weeks.filter((w) => w !== latest && w.status === "ok" && w.report).slice(0, 4);

  async function runNow() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "weekly" }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Não deu certo.");
      // A pesquisa roda no Convex e leva alguns minutos.
      setTimeout(() => router.refresh(), 4000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const n = latest?.numbers;
  const r = latest?.report;

  return (
    <div className="card span-12 wk-card rise">
      <div className="card-title">
        <h3>Semana na XP</h3>
        <span className="card-sub" style={{ margin: 0 }}>
          {latest ? `análise de ${dm(latest.weekEnd)} · ` : "todo sábado às 08:47 · "}
          <button type="button" className="link-btn" onClick={runNow} disabled={busy || running}>
            {running ? "analisando… (uns 5 min)" : busy ? "pedindo…" : "analisar agora"}
          </button>
        </span>
      </div>

      {err && <p className="form-error">{err}</p>}
      {failed && !running && <p className="form-error">A última análise falhou: {failed.error}</p>}

      {!latest || !n || !r ? (
        <p className="card-sub" style={{ margin: 0 }}>
          {running ? "Pesquisando o mercado e olhando a carteira…" : "Ainda sem análise. A primeira roda no sábado de manhã, ou toque em “analisar agora”."}
        </p>
      ) : (
        <>
          <div className="flow-stats">
            <div>
              <span>Na XP hoje</span>
              <b>{brl(n.end)}</b>
              {n.xpCash > 0.5 && <small>+ {brl(n.xpCash)} parado na conta</small>}
            </div>
            <div>
              <span>Rendeu na semana</span>
              {n.hasBase ? (
                <>
                  <b className={n.gain >= 0 ? "up" : "down"}>{signed(n.gain)}</b>
                  {n.gainPct !== null && <small>{pct(n.gainPct, 3)}</small>}
                </>
              ) : (
                <b>—</b>
              )}
            </div>
            <div>
              <span>Contra o CDI</span>
              <b>{n.pctOfCdi !== null ? `${Math.round(n.pctOfCdi * 100)}% do CDI` : "—"}</b>
              {n.cdiPct !== null && <small>CDI {pct(n.cdiPct, 3)}</small>}
            </div>
            <div>
              <span>Aplicado · resgatado</span>
              <b>
                {brl(n.inflow)} · {brl(n.outflow)}
              </b>
              <small>
                {dm(n.weekStart)} a {dm(n.weekEnd)}
              </small>
            </div>
          </div>

          <p className="wk-headline">{r.headline}</p>
          <p className="wk-text">{r.summary}</p>
          <p className="wk-action">
            <Icon name="arrow" size={14} /> {r.action}
          </p>

          {r.opportunities.length > 0 && (
            <ul className="wk-opps">
              {r.opportunities.map((o, i) => (
                <li key={i}>
                  <b>{o.title}</b>
                  <span className="wk-meta">
                    {[o.product, o.rate, `liquidez ${o.liquidity}`, o.minimum && `mínimo ${o.minimum}`, o.tax].filter(Boolean).join(" · ")}
                  </span>
                  <span>{o.why}</span>
                  <span className="wk-meta">Na XP: {o.how}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="wk-cols">
            <div>
              <h4>Cenário</h4>
              <ul>
                {r.market.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Sua carteira</h4>
              <ul>
                {r.portfolio.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
          {r.risks.length > 0 && <p className="card-sub wk-risks">Cuidados: {r.risks.join(" · ")}</p>}

          <details className="wk-more">
            <summary>Fontes e semanas anteriores</summary>
            {latest.sources.length > 0 && (
              <ul className="wk-sources">
                {latest.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {older.length > 0 && (
              <ul className="wk-sources">
                {older.map((w) => (
                  <li key={w.weekEnd}>
                    {dm(w.weekEnd)}: {w.report!.headline}
                  </li>
                ))}
              </ul>
            )}
          </details>
          <p className="card-sub" style={{ margin: "12px 0 0" }}>
            Análise automática do Claude com pesquisa na web, para perfil conservador (D+0/D+1, só XP). Rendimento bruto de IR. Confira a taxa na XP antes de
            aplicar.
          </p>
        </>
      )}
    </div>
  );
}
