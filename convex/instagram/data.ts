import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "../guard";

// O Feed antigo lia o Instagram pelo servidor com a sessão dele. Agora o
// Feed é o próprio instagram.com, limpo por public/instagram-limpo.user.js,
// e o servidor não fala mais com o Instagram. Sobrou só isto: saber se a
// sessão antiga ainda está guardada e apagá-la (com tudo o que foi lido).

export const leftover = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const acc = await ctx.db.query("igAccount").first();
    const posts = await ctx.db.query("igPosts").take(1);
    return { session: Boolean(acc), username: (acc?.username as string | undefined) ?? null, posts: posts.length > 0 };
  },
});

export const disconnect = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    let more = false;
    for (const t of ["igAccount", "igFollowing", "igPosts"] as const) {
      // Em levas, para não estourar o limite de uma mutação.
      const rows = await ctx.db.query(t).take(1500);
      for (const r of rows) await ctx.db.delete(r._id);
      if (rows.length === 1500) more = true;
    }
    return { more };
  },
});
