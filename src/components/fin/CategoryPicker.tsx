"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, GROUPS, categoryOf, type Custom } from "@/lib/fin-taxonomy";

// Classificar sem sair da lista: toca na categoria, digita, Enter. Por
// padrão vira regra para todas as movimentações da mesma pessoa/loja.

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { error?: string; changed?: number; slug?: string };
  if (!res.ok) throw new Error(out.error ?? "Não deu certo.");
  return out;
}

type Option = { slug: string; name: string; group: string; create?: boolean };

export function CategoryPicker({
  txId,
  category,
  custom,
  who,
  variant = "chip",
}: {
  txId: string;
  category: string;
  custom: Custom[];
  who: string | null; // pessoa/loja para a regra; null = sem regra
  variant?: "chip" | "field";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [all, setAll] = useState(Boolean(who));
  const [current, setCurrent] = useState(category);
  const [newGroup, setNewGroup] = useState("Outros gastos");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => setCurrent(category), [category]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const options = useMemo<Option[]>(() => {
    const cats = [...CATEGORIES, ...custom].filter((c) => c.slug !== "a-classificar");
    const words = fold(q).split(/\s+/).filter(Boolean);
    const hits = cats
      .filter((c) => {
        const hay = fold(`${c.name} ${c.group} ${c.slug.replace(/-/g, " ")}`);
        return words.every((w) => hay.includes(w));
      })
      // Nome que começa com o que foi digitado vem primeiro.
      .sort((a, b) => Number(fold(b.name).startsWith(fold(q))) - Number(fold(a.name).startsWith(fold(q))));
    const out: Option[] = hits.map((c) => ({ slug: c.slug, name: c.name, group: c.group }));
    if (q.trim() && !cats.some((c) => fold(c.name) === fold(q.trim()))) out.push({ slug: "", name: q.trim(), group: newGroup, create: true });
    return out;
  }, [q, custom, newGroup]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function choose(o: Option) {
    setBusy(true);
    setMsg("");
    try {
      let slug = o.slug;
      if (o.create) slug = (await post({ action: "addCategory", name: o.name, group: newGroup })).slug!;
      const out = await post({ action: "categorize", txId, category: slug, applySimilar: all && Boolean(who) });
      setCurrent(slug);
      setOpen(false);
      setQ("");
      setMsg(out.changed && out.changed > 1 ? `+${out.changed - 1} parecidas` : "salvo");
      setTimeout(() => setMsg(""), 2500);
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const cat = categoryOf(current, custom);
  const tone = current === "a-classificar" ? " warn" : cat.kind === "internal" || cat.kind === "business" ? " muted" : "";
  let lastGroup = "";

  return (
    <div className={`cat-pick ${variant}${open ? " open" : ""}`} ref={box}>
      <button
        type="button"
        className={`cat-pick-btn${tone}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
      >
        {busy ? "salvando…" : cat.name}
        <span aria-hidden="true">▾</span>
      </button>
      {msg && <span className="cat-pick-msg">{msg}</span>}
      {open && (
        <div className="cat-pop" role="dialog" aria-label="Escolher categoria" onClick={(e) => e.stopPropagation()}>
          <input
            ref={input}
            className="ed-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar ou criar categoria…"
            aria-controls={`cat-list-${txId}`}
            aria-activedescendant={options[active] ? `cat-${txId}-${active}` : undefined}
          />
          {who && (
            <label className="cat-pop-all">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              <span>
                Todas de <b>{who}</b>
              </span>
            </label>
          )}
          <ul className="cat-pop-list" role="listbox" id={`cat-list-${txId}`} ref={list}>
            {options.map((o, i) => {
              const header = !o.create && o.group !== lastGroup && !q.trim();
              lastGroup = o.group;
              return (
                <li key={o.create ? "__new" : o.slug}>
                  {header && <span className="cat-pop-group">{o.group}</span>}
                  <button
                    type="button"
                    role="option"
                    id={`cat-${txId}-${i}`}
                    data-i={i}
                    aria-selected={i === active}
                    className={o.slug === current ? "current" : undefined}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                  >
                    {o.create ? (
                      <>
                        + Criar <b>“{o.name}”</b>
                      </>
                    ) : (
                      <>
                        {o.name}
                        {q.trim() && <small> · {o.group}</small>}
                      </>
                    )}
                  </button>
                  {o.create && i === active && (
                    <select className="ed-input" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} aria-label="Grupo da nova categoria">
                      {GROUPS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
