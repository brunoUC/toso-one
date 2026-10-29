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

export function BudgetTable({ rows, pace, periodLabel, annual }: { rows: BudgetRow[]; pace: number | null; periodLabel: string; annual: boolean }) {
  const router = useRouter();
  const sections = [...new Set(rows.map((r) => r.section))];
  const sum = (list: BudgetRow[], f: (r: BudgetRow) => number) => list.reduce((s, r) => s + f(r), 0);

  return (
    <div className="card span-12">
      <div className="card-title">
        <h3>Linhas do orçamento</h3>
        <span className="card-sub" style={{ margin: 0 }}>
          toque no limite para mudar
        </span>
      </div>
      <p className="card-sub">
        Barra = {periodLabel}
        {pace !== null ? `. Traço = onde um gasto variável deveria estar hoje (${Math.round(pace * 100)}% ${annual ? "do ano" : "do mês"})` : ""}. Média por mês,
        dos meses fechados.
      </p>
      <div className="bud-wrap">
        <table className="data-table bud">
          <thead>
            <tr>
              <th>Linha</th>
              <th>{annual ? "Limite no ano" : "Limite"}</th>
              <th>Média/mês</th>
              <th className="bud-bar-h">{periodLabel}</th>
              <th>{pace !== null ? "Projeção" : "Fechou"}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const list = rows.filter((r) => r.section === section);
              return (
                <Fragment key={section}>
                  <tr className="bud-section">
                    <td>{section}</td>
                    <td>{brl(sum(list, (r) => r.limitPeriod))}</td>
                    <td>{brl(sum(list, (r) => r.avg))}</td>
                    <td>
                      <div className="bud-bar-in">
                        <span className="bud-spent">{brl(sum(list, (r) => r.spent))}</span>
                      </div>
                    </td>
                    <td>{brl(sum(list, (r) => r.projected))}</td>
                  </tr>
                  {list.map((r) => {
                    const ratio = r.limitPeriod ? r.spent / r.limitPeriod : r.spent > 0 ? 2 : 0;
                    const over = r.projected > r.limitPeriod * 1.02;
                    return (
                      <tr key={r.id} className="bud-row">
                        <td>
                          <Link href={r.href} className="bud-link" title={`Ver os gastos de ${r.name}`}>
                            {r.name}
                          </Link>
                          <small className="bud-kind"> · {r.kind}</small>
                          {r.note && <small className="bud-note">{r.note}</small>}
                        </td>
                        <td>
                          <LimitCell row={r} annual={annual} onSaved={() => router.refresh()} />
                        </td>
                        <td className={r.avg > r.limit * 1.1 ? "down" : undefined}>
                          <Link href={r.avgHref} className="bud-avg" title={`Ver os gastos que formam a média de ${r.name}`}>
                            {brl(r.avg)}
                          </Link>
                        </td>
                        <td className="bud-bar-c">
                          <div className="bud-bar-in">
                            <span className="bud-bar" title={`${brl(r.spent)} de ${brl(r.limitPeriod)}`}>
                              <i className={ratio > 1 ? "over" : undefined} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
                              {r.kind === "variável" && pace !== null && <em style={{ left: `${pace * 100}%` }} />}
                            </span>
                            <span className="bud-spent">{brl(r.spent)}</span>
                          </div>
                        </td>
                        <td className={over ? "down" : "up"}>{brl(r.projected)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr className="bud-total">
              <td>Total</td>
              <td>{brl(sum(rows, (r) => r.limitPeriod))}</td>
              <td>{brl(sum(rows, (r) => r.avg))}</td>
              <td>
                <div className="bud-bar-in">
                  <span className="bud-spent">{brl(sum(rows, (r) => r.spent))}</span>
                </div>
              </td>
              <td>{brl(sum(rows, (r) => r.projected))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
