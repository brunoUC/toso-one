import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";
import { ForgetOld } from "./ForgetOld";
import { SafariLink } from "./SafariLink";

export const metadata: Metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

// O Feed é o próprio instagram.com, aberto no Safari, com o ajuste
// public/instagram-limpo.user.js (app "Userscripts"): a página inicial vai
// direto para "Seguindo" e somem Reels, Stories, Explorar, sugestões e
// anúncios. Login, busca, curtir e comentar são os do Instagram.

const FOLLOWING = "https://www.instagram.com/?variant=following";
const SEARCH = "https://www.instagram.com/explore/search/";
const USERSCRIPTS = "https://apps.apple.com/app/userscripts/id1463298887";
const SCRIPT = "/instagram-limpo.user.js";

async function leftover(): Promise<{ session: boolean; username: string | null; posts: boolean } | null> {
  if (!convexConfigured()) return null;
  try {
    return await convex().query(api.instagram.data.leftover, { secret: serverSecret() });
  } catch {
    return null;
  }
}

export default async function FeedPage() {
  await requireSession("/feed");
  const old = await leftover();

  return (
    <main className="page feed-page">
      <p className="eyebrow">Instagram, só o que importa</p>
      <h1 className="feed-title">Feed</h1>
      <p className="feed-lead">
        O Instagram de verdade, no Safari, só com quem você segue, do mais novo para o mais antigo, e a busca. Sem Reels, Stories, Explorar, sugestões e
        anúncios.
      </p>

      <div className="feed-open">
        <SafariLink className="btn btn-primary" href={FOLLOWING}>
          <Icon name="camera" size={18} /> Abrir o feed
        </SafariLink>
        <SafariLink className="btn btn-ghost" href={SEARCH}>
          <Icon name="search" size={16} /> Buscar
        </SafariLink>
      </div>

      <section className="card feed-card">
        <h2>Primeira vez no iPhone</h2>
        <p className="card-sub">Uma vez só, uns 3 minutos. Depois é só abrir o feed.</p>
        <ol className="feed-steps">
          <li>
            Instale o app <a href={USERSCRIPTS} target="_blank" rel="noreferrer noopener"><b>Userscripts</b></a> (grátis, de código aberto) e abra uma vez: ele
            pede para escolher uma pasta. Escolha qualquer uma (pode ser “No iPhone”).
          </li>
          <li>
            Em <b>Ajustes → Apps → Safari → Extensões → Userscripts</b>, ative e deixe <b>Permitir</b> em instagram.com (ou em todos os sites).
          </li>
          <li>
            No <b>Safari</b>, abra{" "}
            <SafariLink href={SCRIPT}>
              <b>o ajuste do toso one</b>
            </SafariLink>
            , toque no botão <b>aA</b> (ou no ícone de quebra-cabeça) da barra de endereço → <b>Userscripts</b> → <b>Install</b>.
          </li>
          <li>Abra o feed acima e entre com a sua conta do Instagram, como faria no instagram.com.</li>
        </ol>
        <p className="form-note">
          O ajuste roda só no Safari. Por isso, no toso one instalado na Tela de Início, os botões daqui abrem o Instagram no Safari (e não numa janela
          dentro do app). No Mac, o mesmo app Userscripts (ou o Tampermonkey) instala o ajuste pelo mesmo link.
        </p>
      </section>

      <section className="card feed-card">
        <h2>O que o ajuste faz</h2>
        <ul className="feed-list">
          <li>A página inicial abre sempre em <b>Seguindo</b>: só quem você segue, por data.</li>
          <li>Esconde a aba e as páginas de Reels, a fileira de Stories e os destaques.</li>
          <li>Explorar vira a Busca (perfis, lugares, restaurantes, hashtags).</li>
          <li>Esconde sugestões de perfis e de posts, anúncios e o Threads.</li>
          <li>Curtir, comentar, perfis e mensagens continuam como no Instagram.</li>
        </ul>
        <p className="form-note">Se algo que devia sumir aparecer, me mande um print: o Instagram muda a página com frequência e o ajuste se atualiza sozinho.</p>
      </section>

      {old && (old.session || old.posts) && (
        <section className="card feed-card feed-old">
          <div className="grow">
            <h2>Sessão do Feed antigo</h2>
            <p className="card-sub" style={{ margin: 0 }}>
              O Feed antigo guardou a sessão {old.username ? `de @${old.username} ` : ""}(cifrada) e os posts que leu. Ele não usa mais nada disso.
            </p>
          </div>
          <ForgetOld />
        </section>
      )}
    </main>
  );
}
