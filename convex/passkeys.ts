import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./guard";

export const list = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const rows = await ctx.db.query("passkeys").collect();
    return rows
      .map((r) => ({
        credentialId: r.credentialId as string,
        transports: r.transports as string[],
        deviceName: r.deviceName as string,
        backedUp: r.backedUp as boolean,
        createdAt: r.createdAt as number,
        lastUsedAt: (r.lastUsedAt as number | undefined) ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = query({
  args: { secret: v.string(), credentialId: v.string() },
  handler: async (ctx, { secret, credentialId }) => {
    assertServer(secret);
    const row = await ctx.db
      .query("passkeys")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!row) return null;
    return {
      credentialId: row.credentialId as string,
      publicKey: row.publicKey as string,
      counter: row.counter as number,
      transports: row.transports as string[],
      deviceName: row.deviceName as string,
    };
  },
});

export const add = mutation({
  args: {
    secret: v.string(),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.array(v.string()),
    deviceName: v.string(),
    backedUp: v.boolean(),
  },
  handler: async (ctx, { secret, ...cred }) => {
    assertServer(secret);
    const existing = await ctx.db
      .query("passkeys")
      .withIndex("by_credential", (q) => q.eq("credentialId", cred.credentialId))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    await ctx.db.insert("events", { kind: "passkey_added", detail: cred.deviceName, at: now });
    return ctx.db.insert("passkeys", { ...cred, createdAt: now });
  },
});

export const touch = mutation({
  args: { secret: v.string(), credentialId: v.string(), counter: v.number() },
  handler: async (ctx, { secret, credentialId, counter }) => {
    assertServer(secret);
    const row = await ctx.db
      .query("passkeys")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, { counter, lastUsedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { secret: v.string(), credentialId: v.string() },
  handler: async (ctx, { secret, credentialId }) => {
    assertServer(secret);
    const row = await ctx.db
      .query("passkeys")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!row) return false;
    await ctx.db.delete(row._id);
    await ctx.db.insert("events", { kind: "passkey_removed", detail: row.deviceName as string, at: Date.now() });
    return true;
  },
});
