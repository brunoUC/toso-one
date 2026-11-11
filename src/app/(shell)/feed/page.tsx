import type { Metadata } from "next";
import Link from "next/link";
import { ConnectForm } from "@/components/feed/ConnectForm";
import { DisconnectButton, RefreshButton } from "@/components/feed/FeedControls";
import { FeedList } from "@/components/feed/FeedList";
import { Avatar } from "@/components/feed/PostCard";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { convexConfigured } from "@/lib/convex";
import { postAge } from "@/lib/feed";
import { feedPage, feedStatus, type FeedStatus } from "@/lib/instagram";
import { FeedTop } from "./FeedTop";

export const metadata: Metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

function Progress({ st }: { st: FeedStatus }) {
  const filling = st.following > 0 && st.read < st.following;
  return (
    <p className="ig-status">
      {st.backoffUntil ? (
        <span className="warn">O Instagram pediu uma pausa; volta a ler às {new Date(st.backoffUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}.</span>
      ) : filling ? (
        <span>
          Montando seu feed: {st.read} de {st.following} perfis lidos. Ele lê aos poucos para o Instagram não estranhar.
        </span>
      ) : st.following === 0 ? (
        <span>Lendo a lista de quem você segue…</span>
      ) : (
        <span>
          {st.following} perfis seguidos{st.lastTickAt ? ` · última leitura há ${postAge(st.lastTickAt)}` : ""}
        </span>
      )}
    </p>
  );
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ reels?: string }> }) {
  await requireSession("/feed");
  const reels = (await searchParams).reels === "1";

  if (!convexConfigured()) {
    return (
      <main className="page ig-page">
        <FeedTop />
        <p className="form-error">Convex não configurado: o Feed precisa dele para guardar a sessão e os posts.</p>
      </main>
    );
  }

  const st = await feedStatus();
  const connected = st?.status === "ok";

  if (!connected) {
    const why =
      st?.status === "expired" || st?.status === "checkpoint"
        ? st.error ?? "A sessão do Instagram caiu. Conecte de novo."
        : "Conecte sua conta para ver os posts de quem você segue, do mais novo para o mais antigo. Sem Reels, sem Stories, sem sugeridos.";
    return (
      <main className="page ig-page">
        <FeedTop />
        <section className="card ig-card">
          <h2>Conectar o Instagram</h2>
          <p className="card-sub">{why}</p>
          <ConnectForm pendingMethod={st?.status === "pending2fa" ? st.pendingMethod : null} />
        </section>
      </main>
    );
  }

  const { posts, next } = await feedPage(undefined, reels);

  return (
    <main className="page ig-page">
      <FeedTop />
      <div className="ig-bar">
        <Progress st={st} />
        <RefreshButton running={st.running} />
      </div>
      <div className="ig-filters">
        <Link href="/feed" className={reels ? undefined : "on"}>
          Sem reels
        </Link>
        <Link href="/feed?reels=1" className={reels ? "on" : undefined}>
          Com reels de quem sigo
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="empty">Nenhum post ainda. Os primeiros chegam em alguns minutos: o feed vai sendo montado conforme os perfis são lidos.</p>
      ) : (
        <FeedList initial={posts} next={next} reels={reels} />
      )}

      <footer className="ig-account">
        {st.pic && <Avatar src={st.pic} size={28} />}
        <span className="grow">
          Conectado como <b>@{st.username}</b>
        </span>
        <Icon name="camera" size={14} />
        <DisconnectButton />
      </footer>
    </main>
  );
}
