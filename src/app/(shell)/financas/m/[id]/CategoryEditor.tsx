"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategoryPicker } from "@/components/fin/CategoryPicker";
import type { Custom } from "@/lib/fin-taxonomy";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(out.error ?? "Não deu certo.");
}

export function CategoryEditor(props: { txId: string; category: string; custom: Custom[]; who: string | null; isUser: boolean; note: string }) {
  const router = useRouter();
  const [note, setNote] = useState(props.note);
  const [msg, setMsg] = useState("");

  async function run(fn: () => Promise<void>, ok: string) {
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <div className="fin-editor">
      <CategoryPicker txId={props.txId} category={props.category} custom={props.custom} who={props.who} variant="field" />
      <label className="ed-field">
        Nota
        <input
          className="ed-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== props.note && run(() => post({ action: "note", txId: props.txId, note }), "Nota salva.")}
          placeholder="Opcional"
        />
      </label>
      {props.isUser && (
        <div className="ed-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(() => post({ action: "reset", txId: props.txId }), "Voltou para a classificação automática.")}>
            Voltar ao automático
          </button>
        </div>
      )}
      {msg && <p className="form-note">{msg}</p>}
    </div>
  );
}
