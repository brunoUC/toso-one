import { createHash } from "node:crypto";

// Leitura dos arquivos que ele manda para a Estante:
//  - CSV de exportação do StoryGraph (Manage account → Export StoryGraph Library)
//  - "My Clippings.txt" do Kindle (pasta documents, pelo cabo USB)
//  - HTML de "Exportar anotações" do app do Kindle (chega por e-mail)

export type ImportItem = {
  kind: "book";
  status: "want" | "doing" | "done" | "dropped";
  title: string;
  creator?: string;
  ref?: string;
  cover?: string;
  rating?: number;
  finishedOn?: string;
  note?: string;
};

export type ImportHighlight = {
  hash: string;
  book: string;
  author?: string;
  text: string;
  note?: string;
  location?: string;
  page?: string;
  date?: string;
};

// ── CSV ─────────────────────────────────────────────────────────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const STORYGRAPH_STATUS: Record<string, ImportItem["status"]> = {
  read: "done",
  "to-read": "want",
  "currently-reading": "doing",
  "did-not-finish": "dropped",
};

// "2024/01/15" ou "2024-01-15" → "2024-01-15"
const isoDate = (s: string | undefined) => {
  const m = s?.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
};

export function storygraphItems(csv: string): ImportItem[] {
  const [head, ...rows] = parseCsv(csv);
  if (!head) return [];
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iTitle = col("Title");
  const iAuthors = col("Authors");
  const iIsbn = col("ISBN/UID");
  const iStatus = col("Read Status");
  const iLast = col("Last Date Read");
  const iDates = col("Dates Read");
  const iRating = col("Star Rating");
  const iReview = col("Review");
  if (iTitle < 0 || iStatus < 0) throw new Error("Não parece a exportação do StoryGraph (faltam as colunas Title e Read Status).");
  const out: ImportItem[] = [];
  for (const r of rows) {
    const title = r[iTitle]?.trim();
    const status = STORYGRAPH_STATUS[r[iStatus]?.trim().toLowerCase() ?? ""];
    if (!title || !status) continue;
    const isbn = iIsbn >= 0 ? r[iIsbn]?.replace(/[^0-9X]/gi, "") : "";
    const validIsbn = isbn && (isbn.length === 10 || isbn.length === 13) ? isbn : null;
    const rating = iRating >= 0 ? Number(r[iRating]) : NaN;
    // "Dates Read" pode ter vários intervalos: "2023/01/02-2023/01/20, …"; o último fim vale.
    const datesRead = iDates >= 0 ? r[iDates]?.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) : null;
    const finished = isoDate(iLast >= 0 ? r[iLast] : undefined) ?? isoDate(datesRead?.at(-1));
    out.push({
      kind: "book",
      status,
      title,
      creator: iAuthors >= 0 ? r[iAuthors]?.trim() || undefined : undefined,
      ref: validIsbn ? `isbn:${validIsbn}` : undefined,
      cover: validIsbn ? `https://covers.openlibrary.org/b/isbn/${validIsbn}-M.jpg` : undefined,
      rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
      finishedOn: status === "done" ? finished : undefined,
      note: iReview >= 0 ? r[iReview]?.trim().slice(0, 1000) || undefined : undefined,
    });
  }
  return out;
}

// ── Kindle ──────────────────────────────────────────────────────────────────

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// A mesma posição do mesmo livro é o mesmo highlight (o Kindle duplica a
// entrada quando se estica a marcação); sem posição, vale o texto.
function hashOf(book: string, location: string | undefined, text: string): string {
  const start = location?.split("-")[0];
  const key = start ? `${norm(book)}|L${start}` : `${norm(book)}|${norm(text).slice(0, 200)}`;
  return createHash("sha1").update(key).digest("hex");
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// "Added on Monday, January 1, 2024 10:00:00 AM" / "Adicionado: segunda-feira, 1 de janeiro de 2024 10:00:00"
function clippingDate(meta: string): string | undefined {
  const t = norm(meta);
  const en = t.match(/([a-z]+) (\d{1,2}) (\d{4})/);
  const pt = t.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  let y: number | undefined, m: number | undefined, d: number | undefined;
  if (pt && MONTHS[pt[2]]) [d, m, y] = [Number(pt[1]), MONTHS[pt[2]], Number(pt[3])];
  else if (en && MONTHS[en[1]]) [m, d, y] = [MONTHS[en[1]], Number(en[2]), Number(en[3])];
  return y && m && d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : undefined;
}

// "Título do livro (Sobrenome, Nome)" → título e autor.
function splitTitle(line: string): { book: string; author?: string } {
  const m = line.match(/^(.*)\(([^()]*)\)\s*$/);
  if (!m) return { book: line.trim() };
  const author = m[2].trim();
  // "Harari, Yuval Noah" → "Yuval Noah Harari"
  const pretty = /^[^,]+, [^,]+$/.test(author) ? author.split(", ").reverse().join(" ") : author;
  return { book: m[1].trim(), author: pretty };
}

export function parseClippings(text: string): ImportHighlight[] {
  const byHash = new Map<string, ImportHighlight>();
  const lastOfBook = new Map<string, ImportHighlight>();
  for (const block of text.replace(/^﻿/, "").split(/\r?\n?==========\r?\n?/)) {
    const lines = block.split(/\r?\n/).map((l) => l.replace(/^﻿/, ""));
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length < 3) continue;
    const { book, author } = splitTitle(lines[0]);
    const meta = lines[1];
    const body = lines.slice(2).join("\n").trim();
    const nm = norm(meta);
    const isNote = /\b(note|nota)\b/.test(nm.split(" ").slice(0, 4).join(" "));
    const isHighlight = /\b(highlight|destaque|marcacao|realce)\b/.test(nm);
    if (!body || (!isNote && !isHighlight)) continue; // marcadores de página
    const location = meta.match(/(?:location|posi[cç][aã]o|loc\.?)\s*([\d-]+)/i)?.[1];
    const page = meta.match(/(?:page|p[aá]gina)\s*([\divxlc-]+)/i)?.[1];
    if (isNote) {
      // A nota vai para o highlight anterior do mesmo livro.
      const prev = lastOfBook.get(book);
      if (prev) prev.note = prev.note ? `${prev.note}\n${body}` : body;
      continue;
    }
    const h: ImportHighlight = { hash: hashOf(book, location, body), book, author, text: body, location, page, date: clippingDate(meta) };
    byHash.set(h.hash, h); // o mais novo vence
    lastOfBook.set(book, h);
  }
  return [...byHash.values()];
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

// Exportação do app do Kindle: bookTitle, authors e pares noteHeading/noteText.
export function parseKindleHtml(html: string): ImportHighlight[] {
  const title = decode(html.match(/class=["']bookTitle["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "Sem título");
  const author = decode(html.match(/class=["']authors["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "") || undefined;
  const out: ImportHighlight[] = [];
  const re = /class=["']noteHeading["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["']noteText["'][^>]*>([\s\S]*?)<\/(?:div|h3)>/gi;
  let last: ImportHighlight | null = null;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const heading = decode(m[1]);
    const text = decode(m[2]);
    if (!text) continue;
    const location = heading.match(/(?:location|posi[cç][aã]o|loc\.?)\s*([\d-]+)/i)?.[1];
    const page = heading.match(/(?:page|p[aá]gina)\s*([\divxlc-]+)/i)?.[1];
    if (/^(note|nota)\b/i.test(heading)) {
      if (last) last.note = last.note ? `${last.note}\n${text}` : text;
      continue;
    }
    last = { hash: hashOf(title, location ?? page, text), book: title, author, text, location, page };
    out.push(last);
  }
  return out;
}

export function parseKindle(content: string): ImportHighlight[] {
  if (/class=["']noteText["']/i.test(content)) return parseKindleHtml(content);
  if (content.includes("==========")) return parseClippings(content);
  throw new Error("Não reconheci o arquivo. Mande o My Clippings.txt do Kindle ou o HTML de \"Exportar anotações\" do app.");
}

// Highlights que o favorito leu da página de anotações da Amazon. A posição
// é o início, como no My Clippings, então os dois caminhos não duplicam.
export type AmazonRow = { book: string; author?: string; text: string; note?: string; location?: string; page?: string };

export function amazonHighlights(rows: AmazonRow[]): ImportHighlight[] {
  const byHash = new Map<string, ImportHighlight>();
  for (const r of rows) {
    const book = String(r.book ?? "").trim().slice(0, 300);
    const text = String(r.text ?? "").trim();
    if (!book || !text) continue;
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const location = str(r.location, 40);
    const page = str(r.page, 20);
    const h: ImportHighlight = { hash: hashOf(book, location ?? (page ? `p${page}` : undefined), text), book, author: str(r.author, 200), text: text.slice(0, 4000), note: str(r.note, 2000), location, page };
    byHash.set(h.hash, h);
  }
  return [...byHash.values()];
}
