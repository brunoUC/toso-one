import type { Metadata } from "next";
import { PostGrid } from "@/components/feed/PostGrid";
import { Avatar } from "@/components/feed/PostCard";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { count } from "@/lib/feed";
import { profileOf } from "@/lib/instagram";
import { FeedTop, LiveError } from "../../FeedTop";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `@${decodeURIComponent((await params).username)} · Feed` };
}

export default async function PerfilPage({ params }: Props) {
  const username = decodeURIComponent((await params).username).replace(/[^\w.]/g, "").slice(0, 40);
  await requireSession(`/feed/u/${username}`);
  const r = await profileOf(username);

  return (
    <main className="page ig-page">
      <FeedTop back />
      {!r.ok ? (
        <LiveError error={r.error} kind={r.kind} />
      ) : (
        <>
          <section className="ig-profile">
            <Avatar src={r.data.profile.pic} size={84} />
            <div className="ig-profile-main">
              <h1>
                {r.data.profile.username}
                {r.data.profile.isVerified && <Icon name="check" size={14} className="ig-verified" />}
              </h1>
              <div className="ig-counts">
                {r.data.profile.posts !== undefined && (
                  <span>
                    <b>{count(r.data.profile.posts)}</b> posts
                  </span>
                )}
                {r.data.profile.followers !== undefined && (
                  <span>
                    <b>{count(r.data.profile.followers)}</b> seguidores
                  </span>
                )}
                {r.data.profile.following !== undefined && (
                  <span>
                    <b>{count(r.data.profile.following)}</b> seguindo
                  </span>
                )}
              </div>
              {r.data.profile.fullName && <p className="ig-name">{r.data.profile.fullName}</p>}
              {r.data.profile.category && <p className="ig-cat">{r.data.profile.category}</p>}
              {r.data.profile.bio && <p className="ig-bio">{r.data.profile.bio}</p>}
              <div className="ig-links">
                {r.data.profile.link && (
                  <a href={r.data.profile.link} target="_blank" rel="noreferrer noopener">
                    <Icon name="external" size={13} /> {r.data.profile.link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
                <span className="ig-follow">{r.data.profile.followedByMe ? "Você segue" : "Você não segue"}</span>
              </div>
            </div>
          </section>
          {r.data.profile.isPrivate && !r.data.profile.followedByMe ? (
            <p className="empty">
              <Icon name="lock" size={14} /> Perfil privado.
            </p>
          ) : (
            <PostGrid initial={r.data.posts} pk={r.data.profile.pk} next={r.data.next} />
          )}
        </>
      )}
    </main>
  );
}
