// ==UserScript==
// @name         Instagram limpo (toso one)
// @namespace    https://toso-one.vercel.app
// @version      1.0.0
// @description  O Instagram de verdade, só com o feed de quem você segue (por data) e a busca. Sem Reels, Stories, Explorar, sugestões e anúncios.
// @match        https://www.instagram.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://toso-one.vercel.app/instagram-limpo.user.js
// @downloadURL  https://toso-one.vercel.app/instagram-limpo.user.js
// ==/UserScript==

// Roda no Safari (app "Userscripts") em cima do próprio instagram.com: o
// login, o feed, a busca, curtir e comentar são os do Instagram. Este
// arquivo só esconde o que não interessa e manda a página inicial para o
// feed "Seguindo" (só quem você segue, do mais novo para o mais antigo).
//
// As classes do Instagram são embaralhadas e mudam toda semana, então tudo
// aqui se apoia em links (href), textos e na estrutura da página.

(function () {
  "use strict";

  const FOLLOWING = "/?variant=following";

  // ── Rotas ────────────────────────────────────────────────────────────────
  // Início → Seguindo; Reels e Stories → Seguindo; Explorar → Busca.
  function route() {
    const { pathname, search } = location;
    let to = null;
    if (pathname === "/" && !/variant=following/.test(search)) to = FOLLOWING;
    else if (/^\/(reels|stories)(\/|$)/.test(pathname)) to = FOLLOWING;
    else if (pathname === "/explore/" || pathname === "/explore") to = "/explore/search/";
    if (!to) return;
    // Trava contra laço, caso o Instagram troque o endereço de volta.
    try {
      const last = Number(sessionStorage.getItem("toso-ig-redirect") || 0);
      if (Date.now() - last < 2000) return;
      sessionStorage.setItem("toso-ig-redirect", String(Date.now()));
    } catch (e) {
      /* sem sessionStorage: segue */
    }
    location.replace(to);
  }

  route();
  // O Instagram troca de página sem recarregar: confere a cada mudança.
  for (const fn of ["pushState", "replaceState"]) {
    const orig = history[fn];
    history[fn] = function () {
      const r = orig.apply(this, arguments);
      setTimeout(route, 0);
      return r;
    };
  }
  addEventListener("popstate", route);

  // ── CSS: o que dá para esconder só pelo link ────────────────────────────
  const css = `
    a[href="/reels/"], a[href^="/reels/?"],
    a[href*="threads.net"], a[href*="threads.com"],
    a[href^="/stories/"],
    [data-toso-hide] { display: none !important; }
  `;
  function addCss() {
    // Em document-start a página pode ainda não ter nem o <html>: tenta de
    // novo na próxima mudança.
    const root = document.head || document.documentElement;
    if (!root || document.getElementById("toso-ig-css")) return;
    const s = document.createElement("style");
    s.id = "toso-ig-css";
    s.textContent = css;
    root.appendChild(s);
  }
  addCss();

  // ── O resto pela página ─────────────────────────────────────────────────
  const SUGGESTED = [
    "Sugestões para você",
    "Sugerido para você",
    "Sugeridos para você",
    "Publicações sugeridas",
    "Posts sugeridos",
    "Suggested for you",
    "Suggested posts",
    "Suggested reels",
    "Reels sugeridos",
  ];
  const ADS = ["Patrocinado", "Publicidade", "Sponsored", "Anúncio", "Ad"];

  const hide = (el) => el && el.setAttribute("data-toso-hide", "");

  // Sobe do texto até o bloco dele no feed (o post, o carrossel de sugestões,
  // a coluna da direita): para logo antes do nível em que ficam os posts e
  // nunca pega um bloco que tenha post dentro. Pela estrutura, não pela
  // altura, que muda enquanto as fotos carregam.
  function block(el, main) {
    const art = el.closest("article");
    if (art) return art;
    const feed = main.querySelector("article");
    let cur = el;
    // Sem posts na página (perfil, busca), sobe pouco: só o cartão.
    for (let i = 0; i < (feed ? 25 : 3); i++) {
      const p = cur.parentElement;
      if (!p || p === main || p.querySelector("article")) break;
      cur = p;
    }
    return cur === el ? null : cur;
  }

  function textIs(el, list) {
    const t = (el.textContent || "").trim();
    return t.length < 40 && list.some((w) => t === w);
  }

  function clean() {
    if (!document.body) return;
    const main = document.querySelector("main") || document.body;

    // Explorar → Busca, inclusive na barra de baixo do celular.
    for (const a of document.querySelectorAll('a[href="/explore/"]')) a.setAttribute("href", "/explore/search/");

    // Stories: a fileira de bolinhas no topo do feed (cada uma desenha o
    // anel colorido num <canvas>) e os destaques dos perfis.
    const home = location.pathname === "/";
    // No início, só depois que os posts carregaram: sem eles não dá para
    // saber onde a fileira termina e o feed começa.
    const feedReady = home && main.querySelector("article");
    for (const ul of main.querySelectorAll("ul")) {
      if (ul.hasAttribute("data-toso-seen")) continue;
      if (ul.querySelectorAll("canvas").length < 2 || ul.querySelector("article")) continue;
      if (home && !feedReady) continue;
      ul.setAttribute("data-toso-seen", "");
      let tray = ul;
      // No início, sobe até o bloco inteiro da fileira (com as setas), sem
      // pegar o feed. Nos perfis (destaques), esconde só a lista.
      if (home) {
        while (tray.parentElement && tray.parentElement !== main && !tray.parentElement.querySelector("article")) tray = tray.parentElement;
      }
      hide(tray);
    }
    for (const el of document.querySelectorAll('[aria-label*="Stories"], [aria-label*="stories"]')) {
      if (!el.querySelector("article") && el.tagName !== "MAIN") hide(el);
    }

    // Sugestões, anúncios e reels sugeridos no feed e na coluna da direita.
    for (const el of document.querySelectorAll("span, h2, h3, h4, div[dir='auto']")) {
      if (el.childElementCount > 2) continue;
      if (textIs(el, SUGGESTED) || textIs(el, ADS)) {
        const b = block(el, main);
        if (b && b !== main && !b.contains(main)) hide(b);
      }
    }

    // Depois de "Você está em dia" o Instagram emenda posts sugeridos:
    // esconde tudo o que vier depois do aviso.
    const caught = Array.from(main.querySelectorAll("span, h2, h3")).find((el) =>
      /Você está em dia|Você já viu todas|You're all caught up|You've completely caught up/i.test((el.textContent || "").trim()),
    );
    if (caught) {
      const all = Array.from(main.querySelectorAll("article"));
      for (const art of all) {
        if (caught.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING) hide(art);
      }
    }
  }

  // Reaplica a cada mudança da página (com folga, para não pesar).
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      addCss();
      clean();
    });
  }
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", schedule);
})();
