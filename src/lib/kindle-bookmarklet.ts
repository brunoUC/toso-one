// Favorito "Enviar ao toso one" para a página de anotações do Kindle
// (ler.amazon.com.br/notebook ou read.amazon.com/notebook). Roda dentro da
// página da Amazon, com o login que já está no navegador: lê a lista de
// livros, busca os highlights de cada um (com paginação) e entrega tudo à
// aba do toso one que ele mesmo abre, por postMessage. Nenhuma senha ou
// cookie da Amazon sai do navegador.
//
// A janela do toso one é aberta antes de qualquer espera: só assim o Safari
// não bloqueia o pop-up.

const SOURCE = String.raw`
(async () => {
  const TOSO = "__TOSO__";
  if (!/amazon\./.test(location.hostname) || !/notebook/.test(location.pathname)) {
    alert("Abra ler.amazon.com.br/notebook (ou read.amazon.com/notebook), entre na sua conta e toque no favorito de novo.");
    return;
  }
  const win = window.open(TOSO + "/estante/kindle", "toso-kindle");
  if (!win) { alert("O navegador bloqueou a janela do toso one. Permita pop-ups para a Amazon e tente de novo."); return; }
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;padding:14px 16px;border-radius:12px;background:#1f2d47;color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)";
  document.body.appendChild(box);
  const say = (t) => { box.textContent = "toso one · " + t; };
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => { const m = (s || "").match(/\d[\d.,]*/); return m ? m[0].replace(/[.,]/g, "") : undefined; };
  try {
    say("lendo a lista de livros…");
    const books = [...document.querySelectorAll(".kp-notebook-library-each-book")].map((el) => {
      const title = clean(el.querySelector("h2")?.textContent);
      const by = clean(el.querySelector("p")?.textContent).replace(/^(por|by|de)\s*:\s*/i, "");
      return { asin: el.id, title, author: by || undefined };
    }).filter((b) => b.asin && b.title);
    if (!books.length) throw new Error("não achei a lista de livros nesta página. Ela está carregada?");
    const rows = [];
    const seen = new Set();
    const parser = new DOMParser();
    for (let i = 0; i < books.length; i++) {
      const b = books[i];
      say("livro " + (i + 1) + " de " + books.length + ": " + b.title.slice(0, 60));
      let token = "", state = "", guard = 0;
      do {
        const url = location.origin + "/notebook?asin=" + encodeURIComponent(b.asin) + "&contentLimitState=" + encodeURIComponent(state) + (token ? "&token=" + encodeURIComponent(token) : "") + "&";
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("a Amazon respondeu " + res.status + " em " + b.title);
        const doc = parser.parseFromString(await res.text(), "text/html");
        const has = (el) => el.querySelector("#highlight, #note");
        const all = [...doc.querySelectorAll(".a-row.a-spacing-base")].filter(has);
        const inner = all.filter((el) => ![...el.querySelectorAll(".a-row.a-spacing-base")].some(has));
        for (const row of inner) {
          const text = clean(row.querySelector("#highlight")?.textContent);
          const note = clean(row.querySelector("#note")?.textContent);
          if (!text && !note) continue;
          const head = clean(row.querySelector("#annotationHighlightHeader, #annotationNoteHeader")?.textContent);
          const loc = head.match(/(?:location|posi[cç][aã]o|local)\s*:?\s*([\d.,]+)/i);
          const page = head.match(/(?:page|p[aá]gina)\s*:?\s*([\d.,]+)/i);
          const key = b.asin + "|" + (loc ? loc[1] : "") + "|" + (text || note).slice(0, 80);
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ book: b.title, author: b.author, text: text || note, note: text ? note || undefined : undefined, location: loc ? num(loc[1]) : undefined, page: page ? num(page[1]) : undefined });
        }
        token = doc.querySelector(".kp-notebook-annotations-next-page-start")?.value || "";
        state = doc.querySelector(".kp-notebook-content-limit-state")?.value || "";
      } while (token && ++guard < 100);
    }
    say(rows.length + " highlights de " + books.length + " livros. Enviando…");
    const payload = { type: "toso-kindle", rows, books: books.length };
    let sent = false;
    const send = () => { if (!win.closed) win.postMessage(payload, TOSO); };
    window.addEventListener("message", (e) => {
      if (e.origin !== TOSO) return;
      if (e.data && e.data.type === "toso-ready") send();
      if (e.data && e.data.type === "toso-done") { sent = true; say(e.data.text); setTimeout(() => box.remove(), 8000); }
    });
    send();
    setTimeout(() => { if (!sent) say("se a aba do toso one não mostrou nada, entre nela e toque no favorito de novo."); }, 20000);
  } catch (err) {
    say("erro: " + (err && err.message ? err.message : err));
  }
})();
`;

export function kindleBookmarklet(origin: string): string {
  const code = SOURCE.replace("__TOSO__", origin)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return "javascript:" + encodeURIComponent(code);
}
