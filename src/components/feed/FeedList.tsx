"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPost } from "@/lib/feed";
import { PostCard } from "./PostCard";

// O feed em ordem cronológica, com um separador por dia e carregamento
// automático ao chegar no fim.

const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(ms);

function dayLabel(ms: number): string {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86_400_000);
  const k = dayKey(ms);
  if (k === today) return "Hoje";
  if (k === yesterday) return "Ontem";
  const s = dayFmt.format(ms);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FeedList({ initial, next: initialNext, reels }: { initial: FeedPost[]; next: number | null; reels: boolean }) {
  const [posts, setPosts] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPosts(initial);
    setNext(initialNext);
  }, [initial, initialNext]);

  const more = useCallback(async () => {
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed?antes=${next}${reels ? "&reels=1" : ""}`);
      const data = (await res.json()) as { posts?: FeedPost[]; next?: number | null; error?: string };
      if (!res.ok || !data.posts) throw new Error(data.error ?? "Falha ao carregar.");
      setPosts((p) => [...p, ...data.posts!]);
      setNext(data.next ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [next, busy, reels]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void more(), { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, next]);

  let lastDay = "";
  return (
    <div className="ig-feed">
      {posts.map((p) => {
        const k = dayKey(p.takenAt);
        const sep = k !== lastDay;
        lastDay = k;
        return (
          <div key={p.mediaId}>
            {sep && <h3 className="ig-day">{dayLabel(p.takenAt)}</h3>}
            <PostCard post={p} />
          </div>
        );
      })}
      <div ref={sentinel} />
      {error && <p className="form-error">{error}</p>}
      {next ? (
        <button type="button" className="btn btn-ghost btn-sm ig-load" onClick={() => void more()} disabled={busy}>
          {busy ? "Carregando…" : "Mais antigos"}
        </button>
      ) : (
        posts.length > 0 && <p className="ig-end">Você viu tudo dos últimos 60 dias.</p>
      )}
    </div>
  );
}
