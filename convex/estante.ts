import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import type { GenericDatabaseReader, GenericDataModel } from "convex/server";
import { v, type GenericId } from "convex/values";
import { assertServer } from "./guard";

// Estante: livros, filmes e séries (quero / em andamento / feito) e os
// highlights do Kindle. Tudo passa pelo servidor do Next com o segredo.

export type ShelfKind = "book" | "movie" | "series";
export type ShelfStatus = "want" | "doing" | "done" | "dropped";

export type ShelfItem = {
  id: string;
  kind: ShelfKind;
  status: ShelfStatus;
  title: string;
  creator: string | null;
  year: number | null;
  cover: string | null;
  ref: string | null;
  recommendedBy: string | null;
  note: string | null;
  rating: number | null;
  finishedOn: string | null;
  source: string;
  addedAt: number;
};

export type Highlight = {
  id: string;
  book: string;
  author: string | null;
  text: string;
  note: string | null;
  location: string | null;
  page: string | null;
  date: string | null;
};

const KINDS = ["book", "movie", "series"];
const STATUSES = ["want", "doing", "done", "dropped"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toItem = (r: any): ShelfItem => ({
  id: r._id,
  kind: r.kind,
  status: r.status,
  title: r.title,
  creator: r.creator ?? null,
  year: r.year ?? null,
  cover: r.cover ?? null,
  ref: r.ref ?? null,
  recommendedBy: r.recommendedBy ?? null,
  note: r.note ?? null,
  rating: r.rating ?? null,
  finishedOn: r.finishedOn ?? null,
  source: r.source,
  addedAt: r.addedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toHighlight = (r: any): Highlight => ({
  id: r._id,
  book: r.book,
  author: r.author ?? null,
  text: r.text,
  note: r.note ?? null,
  location: r.location ?? null,
  page: r.page ?? null,
  date: r.date ?? null,
});

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Mesmo título (sem subtítulo) e mesmo tipo = mesma obra.
const titleKey = (kind: string, title: string) => `${kind}|${norm(title.split(/[:(]/)[0])}`;

async function findExisting(db: GenericDatabaseReader<GenericDataModel>, kind: string, title: string, ref?: string) {
  if (ref) {
    const hit = await db
      .query("shelf")
      .withIndex("by_ref", (q) => q.eq("ref", ref))
      .first();
    if (hit) return hit;
  }
  const key = titleKey(kind, title);
  const all = await db.query("shelf").collect();
  return all.find((r) => titleKey(r.kind as string, r.title as string) === key) ?? null;
}

export const list = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const rows = await ctx.db.query("shelf").collect();
    return rows.map(toItem).sort((a, b) => b.addedAt - a.addedAt);
  },
});

const itemArgs = {
  kind: v.string(),
  status: v.string(),
  title: v.string(),
  creator: v.optional(v.string()),
  year: v.optional(v.number()),
  cover: v.optional(v.string()),
  ref: v.optional(v.string()),
  recommendedBy: v.optional(v.string()),
  note: v.optional(v.string()),
  rating: v.optional(v.number()),
  finishedOn: v.optional(v.string()),
};

function cleanItem(a: {
  kind: string;
  status: string;
  title: string;
  creator?: string;
  year?: number;
  cover?: string;
  ref?: string;
  recommendedBy?: string;
  note?: string;
  rating?: number;
  finishedOn?: string;
}) {
  if (!KINDS.includes(a.kind)) throw new Error("Tipo inválido.");
  if (!STATUSES.includes(a.status)) throw new Error("Situação inválida.");
  const title = a.title.trim().slice(0, 200);
  if (!title) throw new Error("Falta o título.");
  const opt = (s: string | undefined, max: number) => s?.trim().slice(0, max) || undefined;
  return {
    kind: a.kind,
    status: a.status,
    title,
    creator: opt(a.creator, 200),
    year: a.year && a.year > 1000 && a.year < 3000 ? Math.round(a.year) : undefined,
    cover: a.cover && /^https:\/\//.test(a.cover) ? a.cover.slice(0, 500) : undefined,
    ref: opt(a.ref, 120),
    recommendedBy: opt(a.recommendedBy, 80),
    note: opt(a.note, 1000),
    rating: a.rating != null && a.rating >= 0 && a.rating <= 5 ? a.rating : undefined,
    finishedOn: a.finishedOn && /^\d{4}-\d{2}-\d{2}$/.test(a.finishedOn) ? a.finishedOn : undefined,
  };
}

// Adiciona ou, se a obra já está na estante, atualiza (sem perder quem
// indicou nem a nota).
export const add = mutation({
  args: { secret: v.string(), ...itemArgs },
  handler: async (ctx, { secret, ...a }) => {
    assertServer(secret);
    const doc = cleanItem(a);
    const existing = await findExisting(ctx.db, doc.kind, doc.title, doc.ref);
    if (existing) {
      const patch: Record<string, unknown> = { status: doc.status };
      for (const k of ["creator", "year", "cover", "ref", "recommendedBy", "note", "rating", "finishedOn"] as const) {
        if (doc[k] !== undefined) patch[k] = doc[k];
      }
      if (doc.status === "done" && !doc.finishedOn && !existing.finishedOn) patch.finishedOn = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
      await ctx.db.patch(existing._id as GenericId<"shelf">, patch);
      return { id: existing._id as string, existed: true };
    }
    const finishedOn = doc.status === "done" && !doc.finishedOn ? new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) : doc.finishedOn;
    const id = await ctx.db.insert("shelf", { ...doc, finishedOn, source: "manual", addedAt: Date.now() });
    return { id: id as string, existed: false };
  },
});

export const update = mutation({
  args: {
    secret: v.string(),
    id: v.string(),
    status: v.optional(v.string()),
    recommendedBy: v.optional(v.string()),
    note: v.optional(v.string()),
    rating: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { secret, id, status, recommendedBy, note, rating }) => {
    assertServer(secret);
    const _id = ctx.db.normalizeId("shelf", id);
    const row = _id ? await ctx.db.get(_id) : null;
    if (!_id || !row) throw new Error("Item não encontrado.");
    const patch: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!STATUSES.includes(status)) throw new Error("Situação inválida.");
      patch.status = status;
      if (status === "done" && !row.finishedOn) patch.finishedOn = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    }
    if (recommendedBy !== undefined) patch.recommendedBy = recommendedBy.trim().slice(0, 80) || undefined;
    if (note !== undefined) patch.note = note.trim().slice(0, 1000) || undefined;
    if (rating !== undefined) patch.rating = rating == null ? undefined : Math.max(0, Math.min(5, rating));
    await ctx.db.patch(_id, patch);
  },
});

export const remove = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertServer(secret);
    const _id = ctx.db.normalizeId("shelf", id);
    if (_id) await ctx.db.delete(_id);
  },
});

// Exportação do StoryGraph (já convertida em linhas pelo Next). Não
// sobrescreve o que ele mudou à mão: só preenche o que falta e atualiza a
// situação quando o StoryGraph está mais adiante (quero → lendo → lido).
export const importItems = mutation({
  args: { secret: v.string(), items: v.array(v.object(itemArgs)) },
  handler: async (ctx, { secret, items }) => {
    assertServer(secret);
    const rank: Record<string, number> = { want: 0, doing: 1, dropped: 2, done: 3 };
    const all = await ctx.db.query("shelf").collect();
    const byKey = new Map(all.map((r) => [titleKey(r.kind as string, r.title as string), r]));
    const byRef = new Map(all.filter((r) => r.ref).map((r) => [r.ref as string, r]));
    let added = 0;
    let updated = 0;
    for (const raw of items.slice(0, 500)) {
      let doc;
      try {
        doc = cleanItem(raw);
      } catch {
        continue;
      }
      const hit = (doc.ref && byRef.get(doc.ref)) || byKey.get(titleKey(doc.kind, doc.title));
      if (hit) {
        const patch: Record<string, unknown> = {};
        if (rank[doc.status] > rank[hit.status as string]) patch.status = doc.status;
        for (const k of ["creator", "year", "cover", "ref", "rating", "finishedOn", "note"] as const) {
          if (doc[k] !== undefined && hit[k] == null) patch[k] = doc[k];
        }
        if (Object.keys(patch).length) {
          await ctx.db.patch(hit._id, patch);
          updated++;
        }
        continue;
      }
      const id = await ctx.db.insert("shelf", { ...doc, source: "storygraph", addedAt: Date.now() });
      const row = await ctx.db.get(id);
      if (row) {
        byKey.set(titleKey(doc.kind, doc.title), row);
        if (doc.ref) byRef.set(doc.ref, row);
      }
      added++;
    }
    return { added, updated };
  },
});

// ── Highlights ───────────────────────────────────────────────────────────────

export const highlights = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const rows = await ctx.db.query("highlights").collect();
    return rows.map(toHighlight);
  },
});

// Um highlight por dia, sempre o mesmo durante o dia (sorteio pela data).
export const ofTheDay = query({
  args: { secret: v.string(), date: v.string() },
  handler: async (ctx, { secret, date }) => {
    assertServer(secret);
    const rows = await ctx.db.query("highlights").collect();
    const pool = rows.filter((r) => (r.text as string).length >= 40 && (r.text as string).length <= 600);
    const list = pool.length ? pool : rows;
    if (!list.length) return null;
    let h = 2166136261;
    for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    list.sort((a, b) => (a.hash < b.hash ? -1 : 1));
    return { ...toHighlight(list[Math.abs(h) % list.length]), total: rows.length };
  },
});

const hlArgs = v.object({
  hash: v.string(),
  book: v.string(),
  author: v.optional(v.string()),
  text: v.string(),
  note: v.optional(v.string()),
  location: v.optional(v.string()),
  page: v.optional(v.string()),
  date: v.optional(v.string()),
});

export const importHighlights = mutation({
  args: { secret: v.string(), rows: v.array(hlArgs) },
  handler: async (ctx, { secret, rows }) => {
    assertServer(secret);
    let added = 0;
    let updated = 0;
    for (const r of rows.slice(0, 1000)) {
      const text = r.text.trim().slice(0, 4000);
      if (!text) continue;
      const doc = {
        hash: r.hash.slice(0, 64),
        book: r.book.trim().slice(0, 300) || "Sem título",
        author: r.author?.trim().slice(0, 200) || undefined,
        text,
        note: r.note?.trim().slice(0, 2000) || undefined,
        location: r.location?.slice(0, 40) || undefined,
        page: r.page?.slice(0, 20) || undefined,
        date: r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined,
      };
      const hit = await ctx.db
        .query("highlights")
        .withIndex("by_hash", (q) => q.eq("hash", doc.hash))
        .first();
      if (hit) {
        // Highlight esticado no Kindle: mesma posição, texto novo.
        const patch: Record<string, unknown> = {};
        if (doc.text !== hit.text) patch.text = doc.text;
        if (doc.note && doc.note !== hit.note) patch.note = doc.note;
        if (Object.keys(patch).length) {
          await ctx.db.patch(hit._id, patch);
          updated++;
        }
        continue;
      }
      await ctx.db.insert("highlights", { ...doc, importedAt: Date.now() });
      added++;
    }
    return { added, updated };
  },
});

export const removeHighlight = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertServer(secret);
    const _id = ctx.db.normalizeId("highlights", id);
    if (_id) await ctx.db.delete(_id);
  },
});
