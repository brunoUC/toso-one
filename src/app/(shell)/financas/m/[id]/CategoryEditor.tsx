"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, GROUPS, type Custom } from "@/lib/fin-taxonomy";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { error?: string; changed?: number; slug?: string };
  if (!res.ok) throw new Error(out.error ?? "Não deu certo.");
  return out;
}

export function CategoryEditor(props: {
  txId: string;
  category: string;
  custom: Custom[];
  canApply: boolean;
  applyLabel: string;
  similarCount: number;
  isUser: boolean;
  note: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(props.category);
  const [apply, setApply] = useState(props.canApply);
  const [note, setNote] = useState(props.note);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newCat, setNewCat] = useState<{ name: string; group: string } | null>(null);
  const all = [...CATEGORIES, ...props.custom];

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg("");
    try {
      setMsg(await fn());
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      let slug = category;
      if (newCat) {
        slug = (await post({ action: "addCategory", ...newCat })).slug!;
        setNewCat(null);
        setCategory(slug);
      }
      const out = await post({ action: "categorize", txId: props.txId, category: slug, applySimilar: apply && props.canApply });
      if (note !== props.note) await post({ action: "note", txId: props.txId, note });
      return out.changed && out.changed > 1 ? `Salvo. ${out.changed} movimentações seguiram a regra.` : "Salvo.";
    });

  return (
    <div className="fin-editor">
      <label className="ed-field">
        Categoria
        <select
          className="ed-input"
          value={newCat ? "__new" : category}
          onChange={(e) => {
            if (e.target.value === "__new") setNewCat({ name: "", group: "Outros gastos" });
            else {
              setNewCat(null);
              setCategory(e.target.value);
            }
          }}
        >
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {all
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value="__new">+ Nova categoria…</option>
        </select>
      </label>
      {newCat && (
        <div className="pair2">
          <label className="ed-field">
            Nome
            <input className="ed-input" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Ex.: Personal trainer" />
          </label>
          <label className="ed-field">
            Grupo
            <select className="ed-input" value={newCat.group} onChange={(e) => setNewCat({ ...newCat, group: e.target.value })}>
              {GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {props.canApply && (
        <label className="remember">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
          <span>
            Sempre que for {props.applyLabel}
            {props.similarCount ? ` (mais ${props.similarCount} hoje)` : ""}
          </span>
        </label>
      )}
      <label className="ed-field">
        Nota
        <input className="ed-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
      </label>
      <div className="ed-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
        {props.isUser && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => run(async () => (await post({ action: "reset", txId: props.txId }), "Voltou para a classificação automática."))}
          >
            Voltar ao automático
          </button>
        )}
      </div>
      {msg && <p className="form-note">{msg}</p>}
    </div>
  );
}
