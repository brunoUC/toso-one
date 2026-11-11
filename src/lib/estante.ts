import "server-only";
import type { Highlight, ShelfItem, ShelfKind, ShelfStatus } from "../../convex/estante";
import { api, convex, convexConfigured, serverSecret } from "./convex";

export type { Highlight, ShelfItem, ShelfKind, ShelfStatus };

// Estante: leitura no Convex e busca por nome.
//  - Livros: Google Books (GOOGLE_BOOKS_KEY opcional) + Open Library.
//  - Filmes e séries: TMDB com TMDB_API_KEY (chave v3 ou token v4, grátis
//    em themoviedb.org; traz o título em português). Sem chave, a busca de
//    sugestões do IMDb, que não pede chave mas devolve o título em inglês.

export type SearchResult = {
  kind: ShelfKind;
  title: string;
  original: string | null;
  creator: string | null;
  year: number | null;
  cover: string | null;
  ref: string;
};

export async function getShelf(): Promise<ShelfItem[]> {
  if (!convexConfigured()) return [];
  return convex().query(api.estante.list, { secret: serverSecret() });
}

export async function getHighlights(): Promise<Highlight[]> {
  if (!convexConfigured()) return [];
  return convex().query(api.estante.highlights, { secret: serverSecret() });
}

export async function highlightOfTheDay(date: string): Promise<(Highlight & { total: number }) | null> {
  if (!convexConfigured()) return null;
  try {
    return await convex().query(api.estante.ofTheDay, { secret: serverSecret(), date });
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Livros ───────────────────────────────────────────────────────────────────

type GBooks = {
  items?: {
    id: string;
    volumeInfo: {
      title: string;
      subtitle?: string;
      authors?: string[];
      publishedDate?: string;
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      industryIdentifiers?: { type: string; identifier: string }[];
    };
  }[];
};

async function googleBooks(q: string): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_BOOKS_KEY;
  const params = new URLSearchParams({ q, maxResults: "8", printType: "books", ...(key ? { key } : {}) });
  const data = await getJson<GBooks>(`https://www.googleapis.com/books/v1/volumes?${params}`);
  return (data?.items ?? []).map((it) => {
    const v = it.volumeInfo;
    const isbn = v.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ?? v.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier;
    const img = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
    return {
      kind: "book",
      title: v.title,
      original: null,
      creator: v.authors?.join(", ") ?? null,
      year: v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null,
      cover: img ? img.replace(/^http:/, "https:").replace("&edge=curl", "") : null,
      ref: isbn ? `isbn:${isbn}` : `gb:${it.id}`,
    } satisfies SearchResult;
  });
}

type OpenLib = { docs?: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; isbn?: string[] }[] };

async function openLibrary(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, limit: "8", fields: "key,title,author_name,first_publish_year,cover_i" });
  const data = await getJson<OpenLib>(`https://openlibrary.org/search.json?${params}`);
  return (data?.docs ?? []).map((d) => ({
    kind: "book",
    title: d.title,
    original: null,
    // O Open Library repete autores com grafias diferentes ("Junior"/"Júnior").
    creator: d.author_name ? [...new Map(d.author_name.map((a) => [norm(a), a])).values()].slice(0, 3).join(", ") : null,
    year: d.first_publish_year ?? null,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    ref: `ol:${d.key}`,
  }));
}

async function searchBooks(q: string): Promise<SearchResult[]> {
  const [gb, ol] = await Promise.all([googleBooks(q), openLibrary(q)]);
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of [...gb, ...ol]) {
    const k = `${norm(r.title.split(/[:(]/)[0])}|${norm(r.creator?.split(",")[0] ?? "")}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(0, 10);
}

// ── Filmes e séries ──────────────────────────────────────────────────────────

type Tmdb = {
  results?: {
    id: number;
    media_type: string;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
  }[];
};

async function tmdb(q: string, key: string): Promise<SearchResult[]> {
  // Token v4 (longo, com pontos) vai no cabeçalho; chave v3 vai na URL.
  const bearer = key.length > 60;
  const params = new URLSearchParams({ query: q, language: "pt-BR", include_adult: "false", ...(bearer ? {} : { api_key: key }) });
  const data = await getJson<Tmdb>(`https://api.themoviedb.org/3/search/multi?${params}`, bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
  return (data?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 10)
    .map((r) => {
      const title = r.title ?? r.name ?? "";
      const original = r.original_title ?? r.original_name ?? null;
      const date = r.release_date ?? r.first_air_date ?? "";
      return {
        kind: r.media_type === "tv" ? "series" : "movie",
        title,
        original: original && norm(original) !== norm(title) ? original : null,
        creator: null,
        year: date ? Number(date.slice(0, 4)) || null : null,
        cover: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
        ref: `tmdb:${r.media_type}:${r.id}`,
      } satisfies SearchResult;
    });
}

type Imdb = { d?: { id: string; l: string; q?: string; qid?: string; s?: string; y?: number; i?: { imageUrl: string } }[] };

async function imdb(q: string): Promise<SearchResult[]> {
  const slug = encodeURIComponent(q.trim().toLowerCase());
  const data = await getJson<Imdb>(`https://v3.sg.media-imdb.com/suggestion/x/${slug}.json?includeVideos=0`);
  return (data?.d ?? [])
    .filter((r) => r.id.startsWith("tt") && ["movie", "tvSeries", "tvMiniSeries", "tvMovie"].includes(r.qid ?? ""))
    .slice(0, 10)
    .map((r) => ({
      kind: r.qid === "tvSeries" || r.qid === "tvMiniSeries" ? "series" : "movie",
      title: r.l,
      original: null,
      creator: r.s ?? null,
      year: r.y ?? null,
      cover: r.i?.imageUrl ? r.i.imageUrl.replace(/\._V1_.*\.jpg$/, "._V1_QL75_UX190_.jpg") : null,
      ref: `imdb:${r.id}`,
    }));
}

export async function searchShelf(q: string, type: "book" | "screen"): Promise<SearchResult[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  if (type === "book") return searchBooks(query);
  const key = process.env.TMDB_API_KEY;
  if (key) {
    const found = await tmdb(query, key);
    if (found.length) return found;
  }
  return imdb(query);
}
