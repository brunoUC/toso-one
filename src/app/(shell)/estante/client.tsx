"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { STATUSES, statusLabel, type Kind, type Status } from "@/lib/estante-labels";

async function post(body: object): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch("/api/estante", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

// Situação e apagar, em cada item da lista.
export function ItemActions({ id, kind, status, title }: { id: string; kind: Kind; status: Status; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(next: string) {
    setBusy(true);
    await post({ action: "update", id, status: next });
    setBusy(false);
    router.refresh();
  }
  async function remove() {
    if (!confirm(`Tirar "${title}" da estante?`)) return;
    setBusy(true);
    await post({ action: "remove", id });
    router.refresh();
  }
  return (
    <span className="item-actions">
      <select value={status} onChange={(e) => change(e.target.value)} disabled={busy} aria-label="Situação">
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel(kind, s)}
          </option>
        ))}
      </select>
      <button type="button" className="icon-btn" onClick={remove} disabled={busy} aria-label={`Tirar ${title}`}>
        <Icon name="trash" size={15} />
      </button>
    </span>
  );
}

// Importar a exportação do StoryGraph ou os highlights do Kindle.
export function Importer({ mode }: { mode: "storygraph" | "kindle" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setMsg({ text: "Arquivo grande demais (máximo 4 MB).", bad: true });
      return;
    }
    setBusy(true);
    setMsg(null);
    const text = await file.text();
    const { ok, data } = await post(mode === "storygraph" ? { action: "storygraph", csv: text } : { action: "kindle", content: text });
    setBusy(false);
    if (!ok) {
      setMsg({ text: String(data.error ?? "Não foi possível importar."), bad: true });
      return;
    }
    setMsg({
      text:
        mode === "storygraph"
          ? `${data.total} livros no arquivo: ${data.added} novos, ${data.updated} atualizados.`
          : `${data.total} highlights de ${data.books} livros: ${data.added} novos, ${data.updated} atualizados.`,
      bad: false,
    });
    router.refresh();
  }

  return (
    <div className="importer">
      <label className={`btn btn-ghost btn-sm${busy ? " disabled" : ""}`}>
        <Icon name="upload" size={15} />
        {busy ? "Importando…" : mode === "storygraph" ? "Importar do StoryGraph (.csv)" : "Importar do Kindle (.txt ou .html)"}
        <input type="file" accept={mode === "storygraph" ? ".csv,text/csv" : ".txt,.html,.htm,text/plain,text/html"} onChange={onFile} disabled={busy} hidden />
      </label>
      {msg && <span className={msg.bad ? "form-error" : "form-note"} style={{ margin: 0 }}>{msg.text}</span>}
    </div>
  );
}

export type HighlightView = { id: string; book: string; author: string | null; text: string; note: string | null; location: string | null; page: string | null; date: string | null };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Highlights agrupados por livro, com busca no texto, no livro e no autor.
export function Highlights({ list }: { list: HighlightView[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = norm(q.trim());
    const hit = (h: HighlightView) => !needle || norm(`${h.text} ${h.note ?? ""} ${h.book} ${h.author ?? ""}`).includes(needle);
    const map = new Map<string, HighlightView[]>();
    for (const h of list) if (hit(h)) map.set(h.book, [...(map.get(h.book) ?? []), h]);
    const loc = (h: HighlightView) => Number((h.location ?? h.page ?? "0").split("-")[0]) || 0;
    return [...map.entries()]
      .map(([book, items]) => ({ book, author: items[0].author, items: items.sort((a, b) => loc(a) - loc(b)), last: items.reduce((m, h) => (h.date && h.date > m ? h.date : m), "") }))
      .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : a.book.localeCompare(b.book)));
  }, [list, q]);

  async function remove(h: HighlightView) {
    if (!confirm("Apagar este highlight?")) return;
    await post({ action: "removeHighlight", id: h.id });
    router.refresh();
  }

  const count = groups.reduce((s, g) => s + g.items.length, 0);
  return (
    <>
      <div className="add-search hl-search">
        <Icon name="search" size={16} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nos highlights" aria-label="Buscar nos highlights" />
        {q && <span className="muted">{count}</span>}
      </div>
      {groups.map((g, i) => (
        <details className="hl-book" key={g.book} open={i === 0 || Boolean(q)}>
          <summary>
            <span>
              <b>{g.book}</b>
              {g.author && <span className="muted"> · {g.author}</span>}
            </span>
            <span className="muted">{g.items.length}</span>
          </summary>
          {g.items.map((h) => (
            <figure className="hl" key={h.id}>
              <blockquote>{h.text}</blockquote>
              {h.note && <p className="hl-note">{h.note}</p>}
              <figcaption>
                {[h.page ? `p. ${h.page}` : null, h.location ? `posição ${h.location}` : null, h.date ? h.date.split("-").reverse().join("/") : null].filter(Boolean).join(" · ")}
                <button type="button" className="icon-btn" onClick={() => remove(h)} aria-label="Apagar highlight">
                  <Icon name="trash" size={13} />
                </button>
              </figcaption>
            </figure>
          ))}
        </details>
      ))}
      {!groups.length && <p className="feed-empty">Nada com “{q}”.</p>}
    </>
  );
}
