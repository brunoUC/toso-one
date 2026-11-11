import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./guard";

// Rotinas da semana do feed do hub. Sem "feito": aparecem nos dias certos e
// pronto (e no resumo da manhã, por push).

export type Routine = {
  id: string;
  title: string;
  days: number[];
  time: string | null;
  note: string | null;
  skipHolidays: boolean;
};

const clean = (days: number[]) => [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
const hhmm = (t: string | undefined) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : undefined);

export const list = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }): Promise<Routine[]> => {
    assertServer(secret);
    const rows = await ctx.db.query("routines").collect();
    return rows
      .map((r) => ({
        id: r._id as string,
        title: r.title as string,
        days: r.days as number[],
        time: (r.time as string | undefined) ?? null,
        note: (r.note as string | undefined) ?? null,
        skipHolidays: r.skipHolidays as boolean,
      }))
      .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title));
  },
});

export const save = mutation({
  args: {
    secret: v.string(),
    id: v.optional(v.string()),
    title: v.string(),
    days: v.array(v.number()),
    time: v.optional(v.string()),
    note: v.optional(v.string()),
    skipHolidays: v.boolean(),
  },
  handler: async (ctx, { secret, id, title, days, time, note, skipHolidays }) => {
    assertServer(secret);
    const doc = {
      title: title.trim().slice(0, 80),
      days: clean(days),
      time: hhmm(time),
      note: note?.trim().slice(0, 200) || undefined,
      skipHolidays,
    };
    if (!doc.title) throw new Error("Dê um nome à rotina.");
    if (!doc.days.length) throw new Error("Escolha pelo menos um dia.");
    if (id) {
      const _id = ctx.db.normalizeId("routines", id);
      if (!_id) throw new Error("Rotina não encontrada.");
      await ctx.db.replace(_id, { ...doc, createdAt: ((await ctx.db.get(_id))?.createdAt as number) ?? Date.now() });
      return id;
    }
    return (await ctx.db.insert("routines", { ...doc, createdAt: Date.now() })) as string;
  },
});

export const remove = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertServer(secret);
    const _id = ctx.db.normalizeId("routines", id);
    if (_id) await ctx.db.delete(_id);
  },
});
