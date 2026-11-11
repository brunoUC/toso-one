"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { media, type FeedPost } from "@/lib/feed";
import { PostCard } from "./PostCard";

// Grade de miniaturas (perfil, local, hashtag). Um toque abre o post.
// Com `pk` e `next`, carrega mais posts do perfil.

export function PostGrid({ initial, pk, next: initialNext }: { initial: FeedPost[]; pk?: string; next?: string }) {
  const [posts, setPosts] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (openIdx === null) dialog.current?.close();
    else if (!dialog.current?.open) dialog.current?.showModal();
  }, [openIdx]);

  async function more() {
    if (!pk || !next) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed?pk=${encodeURIComponent(pk)}&max=${encodeURIComponent(next)}`);
      const r = (await res.json()) as { ok?: boolean; data?: { posts: FeedPost[]; next?: string }; error?: string };
      if (!r.ok || !r.data) throw new Error(r.error ?? "Falha ao carregar.");
      setPosts((p) => [...p, ...r.data!.posts]);
      setNext(r.data.next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (posts.length === 0) return <p className="empty">Nenhum post para mostrar.</p>;
  const current = openIdx !== null ? posts[openIdx] : null;

  return (
    <>
      <ul className="ig-grid">
        {posts.map((p, i) => (
          <li key={p.code}>
            <button type="button" onClick={() => setOpenIdx(i)} aria-label={`Abrir post de ${p.username}`}>
              <img src={media(p.items[0]?.url ?? "")} alt="" loading="lazy" decoding="async" />
              {p.items.length > 1 && <span className="ig-badge">{p.items.length}</span>}
              {p.items.length === 1 && p.items[0]?.video && (
                <span className="ig-badge">
                  <Icon name="play" size={11} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="form-error">{error}</p>}
      {pk && next && (
        <button type="button" className="btn btn-ghost btn-sm ig-load" onClick={() => void more()} disabled={busy}>
          {busy ? "Carregando…" : "Mais posts"}
        </button>
      )}

      <dialog
        ref={dialog}
        className="ig-dialog"
        onClose={() => setOpenIdx(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpenIdx(null);
        }}
      >
        {current && (
          <div className="ig-dialog-body">
            <button type="button" className="ig-close" onClick={() => setOpenIdx(null)} aria-label="Fechar">
              <Icon name="close" size={18} />
            </button>
            <PostCard key={current.code} post={current} />
            <div className="ig-dialog-nav">
              <button type="button" className="btn btn-ghost btn-sm" disabled={openIdx === 0} onClick={() => setOpenIdx((i) => (i ?? 1) - 1)}>
                <Icon name="back" size={14} /> Anterior
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={openIdx === posts.length - 1} onClick={() => setOpenIdx((i) => (i ?? -1) + 1)}>
                Próximo <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
