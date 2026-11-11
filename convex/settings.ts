import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./guard";

// Preferências soltas (chave → JSON). Hoje: "local", o último lugar.

export const get = query({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, { secret, key }) => {
    assertServer(secret);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row ? { value: row.value as string, updatedAt: row.updatedAt as number } : null;
  },
});

export const set = mutation({
  args: { secret: v.string(), key: v.string(), value: v.string() },
  handler: async (ctx, { secret, key, value }) => {
    assertServer(secret);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row) await ctx.db.patch(row._id, { value: value.slice(0, 2000), updatedAt: Date.now() });
    else await ctx.db.insert("settings", { key, value: value.slice(0, 2000), updatedAt: Date.now() });
  },
});
