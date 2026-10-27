import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./guard";

export const log = mutation({
  args: { secret: v.string(), kind: v.string(), detail: v.string() },
  handler: async (ctx, { secret, kind, detail }) => {
    assertServer(secret);
    await ctx.db.insert("events", { kind, detail, at: Date.now() });
  },
});

export const recent = query({
  args: { secret: v.string(), limit: v.number() },
  handler: async (ctx, { secret, limit }) => {
    assertServer(secret);
    const rows = await ctx.db.query("events").withIndex("by_at").order("desc").take(Math.min(limit, 50));
    return rows.map((r) => ({ kind: r.kind as string, detail: r.detail as string, at: r.at as number }));
  },
});
