"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { KIND_LABEL, type Kind } from "@/lib/estante-labels";

// Busca por nome e adiciona à Estante. "Indicado por" serve para quando
// alguém recomenda: fica guardado junto com o item.

type Result = { kind: Kind; title: string; original: string | null; creator: string | null; year: number | null; cover: string | null; ref: string };

export function AddBox({ initialType }: { initialType: "livro" | "tela" }) {
  const router = useRouter();
  const [type, setType] = useState<"livro" | "tela">(initialType);
  const [q, setQ] = useState("");
  const [by, setBy] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/estante/buscar?tipo=${type}&q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { results?: Result[] };
        if (id === seq.current) setResults(data.results ?? []);
      } catch {
        if (id === seq.current) setResults([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, type]);

  async function add(r: Pick<Result, "kind" | "title" | "creator" | "year" | "cover"> & { ref?: string }, status: "want" | "done", key: string) {
    setError(null);
    const res = await fetch("/api/estante", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ...r, creator: r.creator ?? undefined, year: r.year ?? undefined, cover: r.cover ?? undefined, status, recommendedBy: by || undefined }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível adicionar.");
      return;
    }
    const { existed } = (await res.json()) as { existed: boolean };
    setAdded((a) => ({ ...a, [key]: existed ? "atualizado" : status === "want" ? "na lista" : "marcado" }));
    router.refresh();
  }

  const book = type === "livro";
  const manualKinds: Kind[] = book ? ["book"] : ["movie", "series"];

  return (
    <section className="add-box">
      <div className="add-row">
        <div className="seg" role="group" aria-label="Tipo">
          <button type="button" aria-pressed={book} onClick={() => setType("livro")}>
            <Icon name="book" size={14} /> Livro
          </button>
          <button type="button" aria-pressed={!book} onClick={() => setType("tela")}>
            <Icon name="film" size={14} /> Filme ou série
          </button>
        </div>
        <div className="add-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={book ? "Buscar livro pelo nome ou autor" : "Buscar filme ou série pelo nome"}
            aria-label="Buscar"
            enterKeyHint="search"
          />
        </div>
        <input className="add-by" type="text" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Indicado por (opcional)" aria-label="Indicado por" maxLength={80} />
      </div>
      {error && <p className="form-error">{error}</p>}
      {q.trim().length >= 2 && (
        <div className="results">
          {loading && !results && <p className="feed-empty small">Buscando…</p>}
          {results && results.length === 0 && !loading && <p className="feed-empty small">Nada encontrado. Dá para adicionar só pelo nome, abaixo.</p>}
          {results?.map((r) => (
            <div className="result" key={r.ref}>
              <span className="cover sm" data-initial={r.title.charAt(0)}>
                {r.cover && <img src={r.cover} alt="" loading="lazy" />}
              </span>
              <span className="result-text">
                <b>{r.title}</b>
                <span className="muted">
                  {[!book ? KIND_LABEL[r.kind] : null, r.original, r.year, r.creator].filter(Boolean).join(" · ")}
                </span>
              </span>
              {added[r.ref] ? (
                <span className="added">
                  <Icon name="check" size={14} /> {added[r.ref]}
                </span>
              ) : (
                <span className="result-actions">
                  <button className="btn btn-primary btn-sm" type="button" onClick={() => add(r, "want", r.ref)}>
                    {book ? "Quero ler" : "Quero ver"}
                  </button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => add(r, "done", r.ref)}>
                    {book ? "Já li" : "Já vi"}
                  </button>
                </span>
              )}
            </div>
          ))}
          <div className="result manual">
            <span className="result-text">
              <span className="muted">Não é nenhum desses? Adicionar “{q.trim()}” só pelo nome:</span>
            </span>
            <span className="result-actions">
              {manualKinds.map((k) =>
                added[`manual-${k}`] ? (
                  <span className="added" key={k}>
                    <Icon name="check" size={14} /> {added[`manual-${k}`]}
                  </span>
                ) : (
                  <button key={k} className="btn btn-ghost btn-sm" type="button" onClick={() => add({ kind: k, title: q.trim(), creator: null, year: null, cover: null }, "want", `manual-${k}`)}>
                    + {KIND_LABEL[k]}
                  </button>
                ),
              )}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
