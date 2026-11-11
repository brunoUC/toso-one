"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { count, igLink, media, postAge, type FeedPost } from "@/lib/feed";

// Um post: carrossel com rolagem lateral, vídeo só toca quando ele toca,
// legenda curta com "mais". Sem curtir/comentar: é só para ver.

function Slide({ item, active }: { item: FeedPost["items"][number]; active: boolean }) {
  const [play, setPlay] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken) return <div className="ig-broken">Imagem vencida · volta na próxima leitura</div>;
  if (item.video && play && active) {
    return <video className="ig-img" src={media(item.video)} poster={media(item.url)} controls autoPlay playsInline />;
  }
  return (
    <>
      <img className="ig-img" src={media(item.url)} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      {item.video && (
        <button type="button" className="ig-play" onClick={() => setPlay(true)} aria-label="Tocar vídeo">
          <Icon name="play" size={22} />
        </button>
      )}
    </>
  );
}

export function Avatar({ src, size = 34 }: { src: string; size?: number }) {
  return <img className="ig-avatar" src={media(src)} alt="" width={size} height={size} loading="lazy" />;
}

export function PostCard({ post }: { post: FeedPost }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const first = post.items[0];
  // Mesma proporção para o carrossel todo, entre 4:5 e 1,91:1, como no app.
  const ratio = first ? Math.min(1.91, Math.max(0.8, first.w / Math.max(1, first.h))) : 1;
  const long = post.caption.length > 140 || post.caption.split("\n").length > 3;

  return (
    <article className="ig-post">
      <header className="ig-post-head">
        <Link href={`/feed/u/${post.username}`} className="ig-who">
          <Avatar src={post.pic} />
          <span>
            <b>{post.username}</b>
            {post.location && <small>{post.location.name}</small>}
          </span>
        </Link>
        <time dateTime={new Date(post.takenAt).toISOString()} title={new Date(post.takenAt).toLocaleString("pt-BR")}>
          {postAge(post.takenAt)}
        </time>
      </header>

      <div className="ig-media" style={{ aspectRatio: String(ratio) }}>
        <div
          className="ig-track"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
        >
          {post.items.map((item, i) => (
            <div className="ig-slide" key={i}>
              <Slide item={item} active={i === index} />
            </div>
          ))}
        </div>
        {post.items.length > 1 && (
          <>
            <span className="ig-counter">
              {index + 1}/{post.items.length}
            </span>
            <span className="ig-dots" aria-hidden="true">
              {post.items.map((_, i) => (
                <i key={i} className={i === index ? "on" : undefined} />
              ))}
            </span>
          </>
        )}
        {post.kind === "reel" && <span className="ig-kind">reel</span>}
      </div>

      <div className="ig-post-body">
        <div className="ig-stats">
          {post.likes !== undefined && (
            <span>
              <Icon name="heart" size={14} /> {count(post.likes)}
            </span>
          )}
          {post.comments !== undefined && (
            <span>
              <Icon name="comment" size={14} /> {count(post.comments)}
            </span>
          )}
          {post.location && (
            <Link href={`/feed/local/${post.location.pk}`} className="ig-place">
              <Icon name="pin" size={14} /> {post.location.name}
            </Link>
          )}
          <a className="ig-out" href={igLink(post.code)} target="_blank" rel="noreferrer noopener" aria-label="Abrir no Instagram">
            <Icon name="external" size={14} />
          </a>
        </div>
        {post.caption && (
          <p className={`ig-caption${open || !long ? "" : " clamp"}`}>
            <Link href={`/feed/u/${post.username}`}>
              <b>{post.username}</b>
            </Link>{" "}
            {post.caption}
          </p>
        )}
        {post.caption && long && !open && (
          <button type="button" className="link-btn ig-more" onClick={() => setOpen(true)}>
            mais
          </button>
        )}
      </div>
    </article>
  );
}
