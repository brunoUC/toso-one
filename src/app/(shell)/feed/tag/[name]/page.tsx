import type { Metadata } from "next";
import { PostGrid } from "@/components/feed/PostGrid";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { count } from "@/lib/feed";
import { tagOf } from "@/lib/instagram";
import { FeedTop, LiveError } from "../../FeedTop";

export const metadata: Metadata = { title: "Hashtag · Feed" };
export const dynamic = "force-dynamic";

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name).replace(/^#/, "").replace(/[\s#]/g, "").slice(0, 60);
  await requireSession(`/feed/tag/${encodeURIComponent(name)}`);
  const r = await tagOf(name);

  return (
    <main className="page ig-page">
      <FeedTop back />
      {!r.ok ? (
        <LiveError error={r.error} kind={r.kind} />
      ) : (
        <>
          <section className="ig-profile">
            <span className="ig-ico big">
              <Icon name="hash" size={30} />
            </span>
            <div className="ig-profile-main">
              <h1>#{r.data.name}</h1>
              {r.data.count > 0 && <p className="ig-cat">{count(r.data.count)} posts</p>}
            </div>
          </section>
          <PostGrid initial={r.data.posts} />
        </>
      )}
    </main>
  );
}
