"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { count, feedApi, media, postAge, type FeedComment } from "@/lib/feed";

// Comentários de um post: lê, curte, responde e publica. Tudo vai direto
// ao Instagram com a conta dele.

function CommentRow({
  c,
  mediaId,
  onReply,
  child = false,
}: {
  c: FeedComment;
  mediaId: string;
  onReply: (c: FeedComment) => void;
  child?: boolean;
}) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likes);
  const [replies, setReplies] = useState<FeedComment[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const on = !liked;
    setLiked(on);
    setLikes((n) => Math.max(0, n + (on ? 1 : -1)));
    const r = await feedApi({ body: { action: "likeComment", commentPk: c.pk, on } });
    if (!r.ok) {
      setLiked(!on);
      setLikes((n) => Math.max(0, n + (on ? -1 : 1)));
    }
  }

  async function loadReplies() {
    setLoading(true);
    const r = await feedApi<FeedComment[]>({ query: `comentarios=${mediaId}&respostas=${c.pk}` });
    setLoading(false);
    if (r.ok) setReplies(r.data);
  }

  return (
    <li className={child ? "ig-cmt child" : "ig-cmt"}>
      {/* Mídia do Instagram passa pelo proxy (o CDN não deixa embutir). */}
      <img className="ig-avatar" src={media(c.pic)} alt="" width={child ? 24 : 30} height={child ? 24 : 30} loading="lazy" />
      <div className="ig-cmt-main">
        <p>
          <Link href={`/feed/u/${c.username}`}>
            <b>{c.username}</b>
          </Link>{" "}
          {c.text}
        </p>
        <div className="ig-cmt-meta">
          <span>{postAge(c.at)}</span>
          {likes > 0 && <span>{count(likes)} curtida{likes === 1 ? "" : "s"}</span>}
          <button type="button" onClick={() => onReply(c)}>
            responder
          </button>
        </div>
        {!child && c.replies > 0 && replies === null && (
          <button type="button" className="ig-cmt-more" onClick={() => void loadReplies()} disabled={loading}>
            {loading ? "carregando…" : `ver ${c.replies} resposta${c.replies === 1 ? "" : "s"}`}
          </button>
        )}
        {replies && (
          <ul className="ig-cmts">
            {replies.map((r) => (
              <CommentRow key={r.pk} c={r} mediaId={mediaId} onReply={() => onReply(c)} child />
            ))}
          </ul>
        )}
      </div>
      <button type="button" className={`ig-cmt-like${liked ? " on" : ""}`} onClick={() => void toggle()} aria-label={liked ? "Descurtir comentário" : "Curtir comentário"} aria-pressed={liked}>
        <Icon name="heart" size={13} />
      </button>
    </li>
  );
}

export function Comments({ mediaId, code, onPosted }: { mediaId: string; code: string; onPosted: () => void }) {
  const [list, setList] = useState<FeedComment[] | null>(null);
  const [next, setNext] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  async function load(cursor?: string) {
    setBusy(true);
    const r = await feedApi<{ comments: FeedComment[]; next?: string }>({ query: `comentarios=${mediaId}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}` });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setList((l) => [...(cursor ? (l ?? []) : []), ...r.data.comments]);
    setNext(r.data.next);
  }

  useEffect(() => {
    void load();
  }, [mediaId]);

  function reply(c: FeedComment) {
    setReplyTo(c);
    setText((t) => (t.startsWith(`@${c.username} `) ? t : `@${c.username} ${t}`));
    input.current?.focus();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await feedApi<FeedComment>({ body: { action: "comment", mediaId, code, text, ...(replyTo ? { replyTo: replyTo.pk } : {}) } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setList((l) => [...(l ?? []), r.data]);
    setText("");
    setReplyTo(null);
    onPosted();
  }

  return (
    <div className="ig-comments">
      {list === null && !error && <p className="ig-cmt-empty">Carregando comentários…</p>}
      {list && list.length === 0 && <p className="ig-cmt-empty">Nenhum comentário ainda.</p>}
      {list && list.length > 0 && (
        <ul className="ig-cmts">
          {list.map((c) => (
            <CommentRow key={c.pk} c={c} mediaId={mediaId} onReply={reply} />
          ))}
        </ul>
      )}
      {next && (
        <button type="button" className="ig-cmt-more" onClick={() => void load(next)} disabled={busy}>
          mais comentários
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      <form className="ig-cmt-form" onSubmit={send}>
        {replyTo && (
          <span className="ig-replying">
            Respondendo a @{replyTo.username}
            <button
              type="button"
              aria-label="Cancelar resposta"
              onClick={() => {
                setReplyTo(null);
                setText((t) => t.replace(`@${replyTo.username} `, ""));
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        )}
        <div className="ig-cmt-row">
          <textarea
            ref={input}
            rows={1}
            value={text}
            maxLength={2200}
            placeholder="Adicione um comentário…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={busy || !text.trim()}>
            {busy && text ? "…" : "Publicar"}
          </button>
        </div>
      </form>
    </div>
  );
}
