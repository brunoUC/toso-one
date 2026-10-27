import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./guard";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

export const status = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const row = await ctx.db.query("throttle").withIndex("by_key", (q) => q.eq("key", "senha")).unique();
    return { lockedUntil: (row?.lockedUntil as number | undefined) ?? 0 };
  },
});

export const registerFailure = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const now = Date.now();
    const row = await ctx.db.query("throttle").withIndex("by_key", (q) => q.eq("key", "senha")).unique();
    if (!row) {
      await ctx.db.insert("throttle", { key: "senha", failures: 1, windowStart: now, lockedUntil: 0 });
      return { lockedUntil: 0 };
    }
    const fresh = now - (row.windowStart as number) > WINDOW_MS;
    const failures = fresh ? 1 : (row.failures as number) + 1;
    const lockedUntil = failures >= MAX_FAILURES ? now + LOCK_MS : (row.lockedUntil as number);
    await ctx.db.patch(row._id, {
      failures: failures >= MAX_FAILURES ? 0 : failures,
      windowStart: fresh || failures >= MAX_FAILURES ? now : (row.windowStart as number),
      lockedUntil,
    });
    if (failures >= MAX_FAILURES) {
      await ctx.db.insert("events", { kind: "password_locked", detail: "5 senhas erradas", at: now });
    }
    return { lockedUntil };
  },
});

export const reset = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const row = await ctx.db.query("throttle").withIndex("by_key", (q) => q.eq("key", "senha")).unique();
    if (row) await ctx.db.patch(row._id, { failures: 0, windowStart: Date.now(), lockedUntil: 0 });
  },
});
