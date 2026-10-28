"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";

const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const full = (iso: string) => `${day(iso)}/${iso.slice(0, 4)}`;

// Datas de um destino (janela de ida e dias de viagem), editáveis ali mesmo.
// Grava para todas as origens do destino e dispara a coleta delas.
export function InlineDates({
  codes,
  city,
  window: initialWindow,
  stay: initialStay,
  varies,
  canEdit,
}: {
  codes: string[];
  city: string;
  window: [string, string];
  stay: [number, number];
  varies: boolean;
  canEdit: boolean;
}) {
  const [win, setWin] = useState(initialWindow);
  const [stay, setStay] = useState(initialStay);
  const [draft, setDraft] = useState<{ w0: string; w1: string; s0: string; s1: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const body = { destinations: codes, window: [draft.w0, draft.w1], stay: [Number(draft.s0), Number(draft.s1)] };
    if (!draft.w0 || !draft.w1 || draft.w1 <= draft.w0) return setMsg({ ok: false, text: "A data final precisa ser depois da inicial." });
    if (!(body.stay[0] >= 1 && body.stay[0] <= body.stay[1])) return setMsg({ ok: false, text: "Dias: mínimo de 1, e o mínimo até o máximo." });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/voos/destino", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Não foi possível salvar." });
      setWin([draft.w0, draft.w1]);
      setStay([body.stay[0], body.stay[1]]);
      setDraft(null);
      setMsg({ ok: data.collect?.ok !== false, text: `Datas salvas. ${data.collectText ?? ""}`.trim() });
    } catch {
      setMsg({ ok: false, text: "Sem conexão com o servidor." });
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    return (
      <form className="dates-edit" onSubmit={save} aria-label={`Datas de ${city}`}>
        <label className="ed-field">
          ida a partir de
          <input className="ed-input" type="date" value={draft.w0} onChange={(e) => setDraft({ ...draft, w0: e.target.value })} required />
        </label>
        <label className="ed-field">
          ida até
          <input className="ed-input" type="date" value={draft.w1} min={draft.w0} onChange={(e) => setDraft({ ...draft, w1: e.target.value })} required />
        </label>
        <div className="ed-field">
          dias de viagem
          <span className="pair2">
            <input className="ed-input num" type="number" min={1} max={90} value={draft.s0} aria-label="mínimo de dias" onChange={(e) => setDraft({ ...draft, s0: e.target.value })} />
            a
            <input className="ed-input num" type="number" min={1} max={90} value={draft.s1} aria-label="máximo de dias" onChange={(e) => setDraft({ ...draft, s1: e.target.value })} />
          </span>
        </div>
        <div className="dates-actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e coletar"}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDraft(null)} disabled={busy}>
            Cancelar
          </button>
        </div>
        {varies && <p className="dates-note">As origens deste destino tinham datas diferentes; todas passam a usar estas.</p>}
        {msg && <p className={`dates-msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</p>}
      </form>
    );
  }

  return (
    <div className="dates">
      <div className="dates-read">
        <span>
          <Icon name="clock" size={14} /> ida de <b>{day(win[0])}</b> a <b>{full(win[1])}</b> · <b>{stay[0] === stay[1] ? stay[0] : `${stay[0]} a ${stay[1]}`}</b> dias
          {varies && <em> (varia por origem)</em>}
        </span>
        {canEdit ? (
          <button
            className="link-btn dates-btn"
            type="button"
            onClick={() => {
              setMsg(null);
              setDraft({ w0: win[0], w1: win[1], s0: String(stay[0]), s1: String(stay[1]) });
            }}
          >
            <Icon name="edit" size={13} /> ajustar datas
          </button>
        ) : (
          <Link className="link-btn dates-btn" href="/entrar?de=%2Fvoos">
            <Icon name="lock" size={13} /> entrar para ajustar
          </Link>
        )}
      </div>
      {msg && <p className={`dates-msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</p>}
    </div>
  );
}
