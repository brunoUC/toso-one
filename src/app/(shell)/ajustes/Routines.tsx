"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Routine } from "@/lib/feed";

// Editor das rotinas da semana (o que aparece no feed do hub nos dias certos).

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Draft = { id?: string; title: string; days: number[]; time: string; note: string; skipHolidays: boolean };
const EMPTY: Draft = { title: "", days: [], time: "", note: "", skipHolidays: true };
const KOBE: Draft = { title: "Levar o Kobe na creche", days: [2, 4, 5], time: "", note: "", skipHolidays: true };

function daysText(days: number[]): string {
  const set = ORDER.filter((d) => days.includes(d));
  if (set.length === 7) return "todo dia";
  if (set.length === 5 && !set.includes(0) && !set.includes(6)) return "dias úteis";
  return set.map((d) => SHORT[d].toLowerCase()).join(", ");
}

function Form({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (day: number) => setD((x) => ({ ...x, days: x.days.includes(day) ? x.days.filter((y) => y !== day) : [...x.days, day] }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/rotinas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", ...d, time: d.time || undefined, note: d.note || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível salvar.");
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form className="rt-form" onSubmit={save}>
      <div className="row">
        <input type="text" placeholder="Ex.: Levar o Kobe na creche" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} maxLength={80} autoFocus aria-label="Nome da rotina" />
        <input type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} aria-label="Horário (opcional)" />
      </div>
      <div className="day-pick" role="group" aria-label="Dias da semana">
        {ORDER.map((day) => (
          <button key={day} type="button" aria-pressed={d.days.includes(day)} onClick={() => toggle(day)}>
            {SHORT[day]}
          </button>
        ))}
      </div>
      <div className="row">
        <input type="text" placeholder="Observação (opcional)" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={200} aria-label="Observação" />
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={d.skipHolidays} onChange={(e) => setD({ ...d, skipHolidays: e.target.checked })} />
          Não mostrar em feriado
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" type="button" onClick={onDone}>
          Cancelar
        </button>
        <button className="btn btn-sm" type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

export function RoutinesEditor({ routines }: { routines: Routine[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);

  async function remove(r: Routine) {
    if (!confirm(`Apagar a rotina "${r.title}"?`)) return;
    await fetch("/api/rotinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", id: r.id }) });
    router.refresh();
  }

  return (
    <>
      {routines.length > 0 && (
        <ul className="rt-edit">
          {routines.map((r) =>
            editing?.id === r.id ? (
              <li key={r.id}>
                <div className="grow">
                  <Form initial={editing} onDone={() => setEditing(null)} />
                </div>
              </li>
            ) : (
              <li key={r.id}>
                <span className="grow">
                  {r.title}
                  <span className="meta">
                    {daysText(r.days)}
                    {r.time ? ` · ${r.time}` : ""}
                    {r.skipHolidays ? " · some em feriado" : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </span>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing({ id: r.id, title: r.title, days: r.days, time: r.time ?? "", note: r.note ?? "", skipHolidays: r.skipHolidays })}>
                  Editar
                </button>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => remove(r)}>
                  Apagar
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {editing && !editing.id ? (
        <Form initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn btn-sm" type="button" onClick={() => setEditing({ ...EMPTY })}>
            Nova rotina
          </button>
          {!routines.some((r) => /kobe/i.test(r.title)) && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing({ ...KOBE })}>
              + Kobe na creche (ter, qui, sex)
            </button>
          )}
        </div>
      )}
    </>
  );
}
