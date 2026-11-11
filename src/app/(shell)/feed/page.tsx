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
            pede para escolher uma pasta. Escolha qualquer uma (pode ser “No iPhone”) e guarde qual foi.
          </li>
          <li>
            Em <b>Ajustes → Apps → Safari → Extensões → Userscripts</b>, ative e, em <b>Outros sites</b> (ou “Todos os sites”), escolha <b>Permitir</b>. Ele
            precisa estar liberado aqui no toso one também, para oferecer a instalação.
          </li>
          <li>
            Abra{" "}
            <SafariLink href={SCRIPT}>
              <b>o ajuste do toso one</b>
            </SafariLink>{" "}
            no <b>Safari</b> (aparece um texto de código). Toque no <b>aA</b> da barra de endereço → <b>Userscripts</b>. Se ele pedir, toque em{" "}
            <b>Permitir sempre neste site</b>. Na janelinha que abre, toque em <b>Install</b>.
          </li>
          <li>Abra o feed acima e entre com a sua conta do Instagram, como faria no instagram.com.</li>
        </ol>
        <details className="feed-planb">
          <summary>O “Install” não apareceu?</summary>
          <ol className="feed-steps">
            <li>
              <a href={SCRIPT} download="instagram-limpo.user.js">
                <b>Baixe o arquivo do ajuste</b>
              </a>{" "}
              (o Safari pergunta se quer baixar: toque em <b>Baixar</b>).
            </li>
            <li>
              No app <b>Arquivos</b>, abra <b>Downloads</b>, segure o dedo em <code>instagram-limpo.user.js</code> → <b>Mover</b> → a pasta que você escolheu
              no Userscripts.
            </li>
            <li>Abra o feed: o Userscripts lê a pasta sozinho. Confira no <b>aA</b> → <b>Userscripts</b> que “Instagram limpo” aparece ligado.</li>
          </ol>
        </details>
        <p className="form-note">
          O ajuste roda só no Safari. Por isso, no toso one instalado na Tela de Início, os botões daqui abrem o Instagram no Safari (e não numa janela
          dentro do app). No Mac, o mesmo app Userscripts (ou o Tampermonkey) instala o ajuste pelo mesmo link.
        </p>
      </section>

      <section className="card feed-card">
        <h2>O que o ajuste faz</h2>
        <ul className="feed-list">
          <li>A página inicial abre sempre em <b>Seguindo</b>: só quem você segue, por data.</li>
          <li>Esconde a aba de Reels, os reels no meio do feed, a fileira de Stories e os destaques.</li>
          <li>Explorar vira a Busca (perfis, lugares, restaurantes, hashtags).</li>
          <li>Esconde sugestões de perfis e de posts, anúncios e o Threads.</li>
          <li>Curtir, comentar, perfis e mensagens continuam como no Instagram.</li>
        </ul>
        <p className="form-note">
          Ao abrir o Instagram, aparece <b>“Instagram limpo ✓”</b> por um instante no topo: é o sinal de que o ajuste está rodando. Se não aparecer, refaça o
          passo 3. Quando o ajuste mudar, abra o link do passo 3 de novo e toque em <b>Install</b> para pegar a versão nova.
        </p>
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
