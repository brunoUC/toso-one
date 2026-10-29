"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { brl } from "@/lib/format";

export type BudgetRow = {
  id: string;
  section: string;
  name: string;
  kind: "fixo" | "variável" | "reserva";
  note: string;
  categories: string[];
  limit: number; // por mês
  limitPeriod: number; // no período mostrado (mês ou ano)
  defaultLimit: number;
  avg: number;
  avgHref: string; // extrato com os meses que entram na média
  spent: number;
  projected: number;
  next: number | null; // projeção do mês seguinte (só na visão do mês atual)
  href: string;
};

const parse = (raw: string) => Number(raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

// Limite editável no próprio valor: toca, digita, Enter (Esc cancela). O
// valor é sempre mensal, mesmo na visão anual.
function LimitCell({ row, annual, onSaved }: { row: BudgetRow; annual: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.limit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save(limit: number | null) {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/financas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "budget", lineId: row.id, limit }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setEditing(false);
    onSaved();
  }

  function commit() {
    const n = parse(value);
    if (!Number.isFinite(n) || n < 0) {
      setError(true);
      return;
    }
    if (n === row.limit) return setEditing(false);
    save(n === row.defaultLimit ? null : Math.round(n));
  }

  if (editing) {
    return (
      <span className="bud-edit">
        <input
          className={`ed-input money${error ? " bad" : ""}`}
          inputMode="numeric"
          autoFocus
          value={value}
          disabled={busy}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(String(row.limit));
              setEditing(false);
            }
          }}
          onBlur={commit}
          aria-label={`Limite mensal de ${row.name}`}
        />
        <small>/mês</small>
      </span>
    );
  }
  return (
    <span className="bud-limit">
      <button type="button" onClick={() => setEditing(true)} title="Mudar o limite mensal">
        <b>{brl(row.limitPeriod)}</b>
        <span aria-hidden="true">✎</span>
      </button>
      {annual && <small>{brl(row.limit)}/mês</small>}
      {error && <small className="down">não salvou</small>}
    </span>
  );
}

// Barra do realizado contra o limite e a frase do resultado. No ano, com a
// projeção: já estourou / vai estourar / sobra no fim do ano.
function Status({ spent, limit, pace, variable, projected }: { spent: number; limit: number; pace: number | null; variable: boolean; projected?: number }) {
  const ratio = limit ? spent / limit : spent > 0 ? 2 : 0;
  const over = spent > limit;
  let text = over ? `estourou ${brl(spent - limit)}` : `sobram ${brl(limit - spent)}`;
  let tone = over ? "down" : "";
  if (projected !== undefined) {
    if (over) text = `já estourou ${brl(spent - limit)}`;
    else if (projected > limit) {
      text = `vai estourar ${brl(projected - limit)}`;
      tone = "warn";
    } else text = `sobra ${brl(limit - projected)} no fim do ano`;
  }
  return (
    <div className="bud-status">
      <span className="bud-bar" title={`${Math.round(ratio * 100)}% do limite`}>
        <i className={over ? "over" : undefined} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
        {variable && pace !== null && <em style={{ left: `${pace * 100}%` }} />}
      </span>
      <small className={tone || undefined}>{text}</small>
    </div>
  );
}

export function BudgetTable({
  rows,
  pace,
  periodLabel,
  annual,
  projectionLabel,
}: {
  rows: BudgetRow[];
  pace: number | null;
  periodLabel: string;
  annual: boolean;
  projectionLabel: string | null; // "nov/26" (mês seguinte) ou "2026" (ano); null = sem projeção
}) {
  const router = useRouter();
  const sections = [...new Set(rows.map((r) => r.section))];
  const sum = (list: BudgetRow[], f: (r: BudgetRow) => number) => list.reduce((s, r) => s + f(r), 0);
  const proj = (r: BudgetRow) => (annual ? r.projected : (r.next ?? 0));

  return (
    <div className="card span-12">
      <div className="card-title">
        <h3>Linhas do orçamento</h3>
        <span className="card-sub" style={{ margin: 0 }}>
          toque no limite para mudar
        </span>
      </div>
      <p className="card-sub">
        {annual
          ? `Realizado até hoje contra o limite do ano. ${projectionLabel ? `Projeção = se continuar na mesma média do ano até ${projectionLabel}.` : ""}`
          : `${projectionLabel ? `Projeção de ${projectionLabel} pelo ritmo de agora: variáveis no passo deste mês, fixos pelo que já foi pago, reservas pela média dos últimos 3 meses. ` : ""}${
              pace !== null ? `Traço na barra = onde um gasto variável deveria estar hoje (${Math.round(pace * 100)}% do mês). ` : ""
            }Média por mês dos meses fechados.`}
      </p>
      <div className="bud-wrap">
        <table className="data-table bud">
          <thead>
            <tr>
              <th>Linha</th>
              {projectionLabel && !annual && <th>Projeção {projectionLabel}</th>}
              <th>{annual ? `Limite ${periodLabel.slice(0, 4)}` : "Limite"}</th>
              <th>{annual ? `Realizado ${periodLabel.slice(5) || ""}`.trim() : `Gasto ${periodLabel}`}</th>
              {projectionLabel && annual && <th>Projeção {projectionLabel}</th>}
              <th className="bud-bar-h">{annual ? "Resultado" : "Situação"}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const list = rows.filter((r) => r.section === section);
              const lim = sum(list, (r) => r.limitPeriod);
              const spent = sum(list, (r) => r.spent);
              return (
                <Fragment key={section}>
                  <tr className="bud-section">
                    <td>{section}</td>
                    {projectionLabel && !annual && <td>{brl(sum(list, proj))}</td>}
                    <td>
                      {brl(lim)}
                      {!annual && <small className="bud-sub">média {brl(sum(list, (r) => r.avg))}</small>}
                    </td>
                    <td>{brl(spent)}</td>
                    {projectionLabel && annual && <td>{brl(sum(list, proj))}</td>}
                    <td>
                      <Status spent={spent} limit={lim} pace={pace} variable={false} projected={annual && projectionLabel ? sum(list, proj) : undefined} />
                    </td>
                  </tr>
                  {list.map((r) => {
                    const p = proj(r);
                    return (
                      <tr key={r.id} className="bud-row">
                        <td>
                          <Link href={r.href} className="bud-link" title={`Ver os gastos de ${r.name}`}>
                            {r.name}
                          </Link>
                          <small className="bud-kind"> · {r.kind}</small>
                          {r.note && <small className="bud-note">{r.note}</small>}
                        </td>
                        {projectionLabel && !annual && <td className={p > r.limitPeriod * 1.02 ? "down" : undefined}>{brl(p)}</td>}
                        <td>
                          <LimitCell row={r} annual={annual} onSaved={() => router.refresh()} />
                          {!annual && (
                            <Link href={r.avgHref} className={`bud-avg bud-sub${r.avg > r.limit * 1.1 ? " down" : ""}`} title={`Ver os gastos que formam a média de ${r.name}`}>
                              média {brl(r.avg)}
                            </Link>
                          )}
                        </td>
                        <td>
                          <b className="bud-spent">{brl(r.spent)}</b>
                        </td>
                        {projectionLabel && annual && <td className={p > r.limitPeriod * 1.02 ? "down" : undefined}>{brl(p)}</td>}
                        <td>
                          <Status spent={r.spent} limit={r.limitPeriod} pace={pace} variable={r.kind === "variável" && !annual} projected={annual && projectionLabel ? p : undefined} />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr className="bud-total">
              <td>Total</td>
              {projectionLabel && !annual && <td>{brl(sum(rows, proj))}</td>}
              <td>
                {brl(sum(rows, (r) => r.limitPeriod))}
                {!annual && <small className="bud-sub">média {brl(sum(rows, (r) => r.avg))}</small>}
              </td>
              <td>{brl(sum(rows, (r) => r.spent))}</td>
              {projectionLabel && annual && <td>{brl(sum(rows, proj))}</td>}
              <td>
                <Status
                  spent={sum(rows, (r) => r.spent)}
                  limit={sum(rows, (r) => r.limitPeriod)}
                  pace={pace}
                  variable={false}
                  projected={annual && projectionLabel ? sum(rows, proj) : undefined}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
