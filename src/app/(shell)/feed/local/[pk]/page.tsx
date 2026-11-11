import type { Metadata } from "next";
import { PostGrid } from "@/components/feed/PostGrid";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { placeOf } from "@/lib/instagram";
import { FeedTop, LiveError } from "../../FeedTop";

export const metadata: Metadata = { title: "Lugar · Feed" };
export const dynamic = "force-dynamic";

export default async function LocalPage({ params }: { params: Promise<{ pk: string }> }) {
  const pk = (await params).pk.replace(/\D/g, "").slice(0, 30);
  await requireSession(`/feed/local/${pk}`);
  const r = await placeOf(pk);
  const maps = r.ok ? `https://maps.apple.com/?q=${encodeURIComponent([r.data.name, r.data.address].filter(Boolean).join(", "))}` : "";

  return (
    <main className="page ig-page">
      <FeedTop back />
      {!r.ok ? (
        <LiveError error={r.error} kind={r.kind} />
      ) : (
        <>
          <section className="ig-profile">
            <span className="ig-ico big">
              <Icon name="pin" size={30} />
            </span>
            <div className="ig-profile-main">
              <h1>{r.data.name || "Lugar"}</h1>
              {r.data.address && <p className="ig-cat">{r.data.address}</p>}
              <div className="ig-links">
                <a href={maps} target="_blank" rel="noreferrer noopener">
                  <Icon name="external" size={13} /> Abrir no Mapas
                </a>
              </div>
            </div>
          </section>
          <h3 className="ig-day">Posts marcados aqui, mais novos primeiro</h3>
          <PostGrid initial={r.data.posts} />
        </>
      )}
    </main>
  );
}
