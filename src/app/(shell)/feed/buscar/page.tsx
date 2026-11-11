import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/feed/PostCard";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { count } from "@/lib/feed";
import { searchInstagram } from "@/lib/instagram";
import { FeedTop, LiveError } from "../FeedTop";

export const metadata: Metadata = { title: "Buscar · Feed" };
export const dynamic = "force-dynamic";

export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSession("/feed/buscar");
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  if (!q) {
    return (
      <main className="page ig-page">
        <FeedTop back />
        <p className="empty">Busque um perfil, um restaurante, um lugar ou uma hashtag.</p>
      </main>
    );
  }
  const r = await searchInstagram(q);

  return (
    <main className="page ig-page">
      <FeedTop q={q} back />
      {!r.ok ? (
        <LiveError error={r.error} kind={r.kind} />
      ) : r.data.users.length + r.data.places.length + r.data.tags.length === 0 ? (
        <p className="empty">Nada encontrado para “{q}”.</p>
      ) : (
        <div className="ig-results">
          {r.data.users.length > 0 && (
            <section>
              <h3 className="ig-day">Perfis</h3>
              <ul className="ig-list">
                {r.data.users.slice(0, 20).map((u) => (
                  <li key={u.pk}>
                    <Link href={`/feed/u/${u.username}`}>
                      <Avatar src={u.pic} size={44} />
                      <span className="grow">
                        <b>
                          {u.username}
                          {u.isVerified && <Icon name="check" size={12} className="ig-verified" />}
                        </b>
                        <small>
                          {u.fullName}
                          {u.isPrivate ? " · privado" : ""}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r.data.places.length > 0 && (
            <section>
              <h3 className="ig-day">Lugares</h3>
              <ul className="ig-list">
                {r.data.places.slice(0, 15).map((p) => (
                  <li key={p.pk}>
                    <Link href={`/feed/local/${p.pk}`}>
                      <span className="ig-ico">
                        <Icon name="pin" size={18} />
                      </span>
                      <span className="grow">
                        <b>{p.name}</b>
                        {p.address && <small>{p.address}</small>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r.data.tags.length > 0 && (
            <section>
              <h3 className="ig-day">Hashtags</h3>
              <ul className="ig-list">
                {r.data.tags.slice(0, 10).map((t) => (
                  <li key={t.name}>
                    <Link href={`/feed/tag/${encodeURIComponent(t.name)}`}>
                      <span className="ig-ico">
                        <Icon name="hash" size={18} />
                      </span>
                      <span className="grow">
                        <b>#{t.name}</b>
                        {t.count > 0 && <small>{count(t.count)} posts</small>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
