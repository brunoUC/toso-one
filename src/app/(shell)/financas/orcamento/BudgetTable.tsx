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
  limit: number;
  defaultLimit: number;
  avg: number;
  median: number;
  spent: number;
  projected: number;
  href: string;
};

export function BudgetTable({ rows, pace, monthLabel }: { rows: BudgetRow[]; pace: number; monthLabel: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const sections = [...new Set(rows.map((r) => r.section))];

  async function save() {
    setBusy(true);
    for (const r of rows) {
      const raw = draft[r.id];
      if (raw === undefined) continue;
      const n = Number(raw.replace(/\./g, "").replace(",", "."));
      const limit = raw.trim() === "" || n === r.defaultLimit ? null : n;
      await fetch("/api/financas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "budget", lineId: r.id, limit }),
      });
    }
    setDraft({});
    setEditing(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card span-12">
      <div className="card-title">
        <h3>Linhas do orçamento</h3>
        <div className="ed-actions">
          {editing ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                {busy ? "Salvando…" : "Salvar limites"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDraft({});
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              editar limites
            </button>
          )}
        </div>
      </div>
      <p className="card-sub">
        Barra = {monthLabel} até hoje. Traço = onde um gasto variável deveria estar hoje ({Math.round(pace * 100)}% do mês). Média e mediana dos meses fechados.
      </p>
      <div className="bud-wrap">
        <table className="data-table bud">
          <thead>
            <tr>
              <th>Linha</th>
              <th>Limite</th>
              <th>Média</th>
              <th>Mediana</th>
              <th className="bud-bar-h">{monthLabel}</th>
              <th>Projeção</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const list = rows.filter((r) => r.section === section);
              const sum = (f: (r: BudgetRow) => number) => list.reduce((s, r) => s + f(r), 0);
              return (
                <Fragment key={section}>
                  <tr className="bud-section">
                    <td>{section}</td>
                    <td>{brl(sum((r) => r.limit))}</td>
                    <td>{brl(sum((r) => r.avg))}</td>
                    <td>{brl(sum((r) => r.median))}</td>
                    <td />
                    <td>{brl(sum((r) => r.projected))}</td>
                  </tr>
                  {list.map((r) => {
                    const ratio = r.limit ? r.spent / r.limit : r.spent > 0 ? 2 : 0;
                    const over = r.projected > r.limit * 1.02;
                    return (
                      <tr key={r.id} className="bud-row">
                        <td>
                          <Link href={r.href} className="bud-link" title={`Ver os gastos de ${r.name} em ${monthLabel}`}>
                            {r.name}
                          </Link>
                          <small className="bud-kind"> · {r.kind}</small>
                          {r.note && <small className="bud-note">{r.note}</small>}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              className="ed-input money"
                              inputMode="numeric"
                              value={draft[r.id] ?? String(r.limit)}
                              onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
                              aria-label={`Limite de ${r.name}`}
                            />
                          ) : (
                            <b>{brl(r.limit)}</b>
                          )}
                        </td>
                        <td className={r.avg > r.limit * 1.1 ? "down" : undefined}>{brl(r.avg)}</td>
                        <td>{brl(r.median)}</td>
                        <td className="bud-bar-c">
                          <span className="bud-bar" title={`${brl(r.spent)} de ${brl(r.limit)}`}>
                            <i className={ratio > 1 ? "over" : undefined} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
                            {r.kind === "variável" && <em style={{ left: `${pace * 100}%` }} />}
                          </span>
                          <span className="bud-spent">{brl(r.spent)}</span>
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
              <td>{brl(rows.reduce((s, r) => s + r.limit, 0))}</td>
              <td>{brl(rows.reduce((s, r) => s + r.avg, 0))}</td>
              <td>{brl(rows.reduce((s, r) => s + r.median, 0))}</td>
              <td>{brl(rows.reduce((s, r) => s + r.spent, 0))}</td>
              <td>{brl(rows.reduce((s, r) => s + r.projected, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
