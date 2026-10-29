import { internalQueryGeneric as internalQuery, mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v, type GenericId } from "convex/values";
import { assertServer } from "../guard";
import { insights, monthly, netWorthSeries, recurring, type LeanTx, type Snapshot } from "./analytics";
import { factsOf, loadOwners, NO_OWNERS } from "./sync";
import { bestRuleFor, CATEGORIES, categoryOf, classify, GROUPS, norm, ruleMatches, type Custom, type Rule } from "./taxonomy";

// Leitura e edição para o app. Tudo exige o segredo do servidor do Next.

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function lean(r: Record<string, unknown>): LeanTx {
  const { _id, _creationTime, counterpartDoc, syncedAt, itemId, at, ...rest } = r;
  void _id, _creationTime, counterpartDoc, syncedAt, itemId, at;
  return rest as unknown as LeanTx;
}

export const itemsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("finItems").collect();
    return rows.map((r) => ({ itemId: r.itemId, historyFrom: r.historyFrom, ownerDocs: r.ownerDocs, ownerNames: r.ownerNames ?? [] }));
  },
});

// Montagem do painel; o "overview" público exige o segredo, a versão interna
// serve para conferir pelo terminal (npx convex run).
async function buildOverview(ctx: GenericQueryCtx<GenericDataModel>) {
    const now = today();
    const items = await ctx.db.query("finItems").collect();
    const accounts = await ctx.db.query("finAccounts").collect();
    const investments = (await ctx.db.query("finInvestments").collect()).filter((i) => !i.gone);
    const snapshots = (await ctx.db.query("finNetWorth").withIndex("by_date").collect()) as unknown as Snapshot[];
    const custom = (await ctx.db.query("finCategories").collect()) as unknown as Custom[];
    const goals = await ctx.db.query("finGoals").collect();
    const budget = (await ctx.db.query("finBudget").collect()).map((b) => ({ lineId: b.lineId as string, limit: b.limit as number }));
    const rulesCount = (await ctx.db.query("finRules").collect()).length;
    const from = new Date(Date.UTC(Number(now.slice(0, 4)) - 1, Number(now.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
    const txs = (await ctx.db.query("finTx").withIndex("by_date", (q) => q.gte("date", from)).collect()).map(lean);

    const months = monthly(txs, custom, now);
    const rec = recurring(txs, custom, now);
    const pending = txs.filter((t) => t.category === "a-classificar");
    const unclassified = { count: pending.length, amount: pending.reduce((s, t) => s - t.amount, 0) };
    const invBalance = investments.reduce((s, i) => s + (i.balance as number), 0);
    const invProfit = investments.reduce((s, i) => s + ((i.profit as number | undefined) ?? 0), 0);
    const latest = snapshots[snapshots.length - 1] ?? null;
    const thisMonth = months[months.length - 1];

    const goalsOut = goals.map((g) => {
      let current = 0;
      if (g.source === "networth") current = latest?.total ?? 0;
      else if (g.source === "investments") current = latest?.investments ?? 0;
      else if (g.source === "manual") current = (g.manualValue as number | undefined) ?? 0;
      else if (g.source === "spend") {
        const scope = (g.scope as string | undefined) ?? "";
        current = scope.startsWith("grupo:") ? (thisMonth.byGroup[scope.slice(6)] ?? 0) : (thisMonth.byCategory[scope] ?? 0);
      }
      return {
        id: g._id as string,
        name: g.name as string,
        target: g.target as number,
        deadline: (g.deadline as string | undefined) ?? null,
        source: g.source as string,
        scope: (g.scope as string | undefined) ?? null,
        manualValue: (g.manualValue as number | undefined) ?? null,
        createdAt: g.createdAt as number,
        current,
      };
    });

    return {
      today: now,
      items: items.map((i) => ({
        itemId: i.itemId as string,
        bank: i.bank as string,
        status: i.status as string,
        executionStatus: (i.executionStatus as string | undefined) ?? null,
        bankUpdatedAt: (i.bankUpdatedAt as string | undefined) ?? null,
        consentExpiresAt: (i.consentExpiresAt as string | undefined) ?? null,
        lastSyncAt: (i.lastSyncAt as number | undefined) ?? null,
        lastSyncError: (i.lastSyncError as string | undefined) || null,
        historyFrom: (i.historyFrom as string | undefined) ?? null,
      })),
      accounts: accounts.map((a) => ({
        accountId: a.accountId as string,
        bank: a.bank as string,
        type: a.type as string,
        subtype: (a.subtype as string | undefined) ?? null,
        name: a.name as string,
        number: (a.number as string | undefined) ?? null,
        balance: a.balance as number,
        creditLimit: (a.creditLimit as number | undefined) ?? null,
        availableCredit: (a.availableCredit as number | undefined) ?? null,
        dueDate: (a.dueDate as string | undefined) ?? null,
      })),
      investments: investments.map((i) => ({
        investmentId: i.investmentId as string,
        bank: i.bank as string,
        name: i.name as string,
        type: i.type as string,
        subtype: (i.subtype as string | undefined) ?? null,
        balance: i.balance as number,
        invested: (i.invested as number | undefined) ?? null,
        profit: (i.profit as number | undefined) ?? null,
        issuer: (i.issuer as string | undefined) ?? null,
        rate: (i.rate as number | undefined) ?? null,
        rateType: (i.rateType as string | undefined) ?? null,
        dueDate: (i.dueDate as string | undefined) ?? null,
        lastTwelveMonthsRate: (i.lastTwelveMonthsRate as number | undefined) ?? null,
      })),
      netWorth: latest,
      series: netWorthSeries(snapshots, now),
      // Em texto: os nomes de grupo têm acento e o Convex só aceita chaves ASCII.
      monthsJson: JSON.stringify(months),
      recurring: rec,
      unclassified,
      topExpenses: txs
        .filter((t) => t.date.slice(0, 7) === now.slice(0, 7) && t.amount < 0 && categoryOf(t.category, custom).kind === "expense")
        .sort((a, b) => a.amount - b.amount)
        .slice(0, 8),
      insights: insights(months, rec, unclassified, { balance: invBalance, profit: invProfit }),
      custom,
      goals: goalsOut,
      budget,
      rulesCount,
      txCount: txs.length,
    };
}

export const overview = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    return buildOverview(ctx);
  },
});

export const overviewInternal = internalQuery({ args: {}, handler: (ctx) => buildOverview(ctx) });

export const txList = query({
  args: { secret: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, { secret, from, to }) => {
    assertServer(secret);
    const rows = await ctx.db
      .query("finTx")
      .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
      .order("desc")
      .collect();
    const accounts = await ctx.db.query("finAccounts").collect();
    const custom = await ctx.db.query("finCategories").collect();
    return {
      rows: rows.map(lean),
      accounts: accounts.map((a) => ({ accountId: a.accountId as string, bank: a.bank as string, type: a.type as string, name: a.name as string })),
      custom: custom as unknown as Custom[],
    };
  },
});

export const txGet = query({
  args: { secret: v.string(), txId: v.string() },
  handler: async (ctx, { secret, txId }) => {
    assertServer(secret);
    const row = await ctx.db.query("finTx").withIndex("by_txId", (q) => q.eq("txId", txId)).unique();
    if (!row) return null;
    const raw = await ctx.db.query("finTxRaw").withIndex("by_txId", (q) => q.eq("txId", txId)).unique();
    const account = await ctx.db.query("finAccounts").withIndex("by_accountId", (q) => q.eq("accountId", row.accountId as string)).unique();
    const facts = factsOf(row as never, NO_OWNERS);
    const suggestion = bestRuleFor(facts);
    const rules = (await ctx.db.query("finRules").collect()) as unknown as (Rule & { _id: string; label: string })[];
    const rule = rules.find((r) => ruleMatches(facts, r)) ?? null;

    // Outras movimentações com a mesma pessoa/loja, para ver o histórico.
    let similar: LeanTx[] = [];
    if (suggestion) {
      const all = await ctx.db.query("finTx").withIndex("by_date").order("desc").collect();
      similar = all
        .filter((t) => t.txId !== txId && ruleMatches(factsOf(t as never, NO_OWNERS), { ...suggestion, category: "" }))
        .slice(0, 30)
        .map(lean);
    }
    const custom = (await ctx.db.query("finCategories").collect()) as unknown as Custom[];
    return {
      tx: { ...lean(row), counterpartDoc: (row.counterpartDoc as string | undefined) ?? null, at: row.at as string, syncedAt: row.syncedAt as number },
      raw: (raw?.raw as string | undefined) ?? null,
      account: account ? { name: account.name as string, bank: account.bank as string, type: account.type as string, number: (account.number as string | undefined) ?? null } : null,
      suggestion,
      rule: rule ? { id: rule._id, label: rule.label, category: rule.category, field: rule.field } : null,
      similar,
      custom,
    };
  },
});

export const rules = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const rows = await ctx.db.query("finRules").collect();
    const custom = (await ctx.db.query("finCategories").collect()) as unknown as Custom[];
    const counts = new Map<string, number>();
    for (const t of await ctx.db.query("finTx").collect()) {
      if (t.categorySource === "rule") {
        const f = factsOf(t as never, NO_OWNERS);
        for (const r of rows) if (ruleMatches(f, r as unknown as Rule)) counts.set(r._id as string, (counts.get(r._id as string) ?? 0) + 1);
      }
    }
    return {
      rules: rows
        .map((r) => ({
          id: r._id as string,
          field: r.field as string,
          label: r.label as string,
          category: r.category as string,
          createdAt: r.createdAt as number,
          hits: counts.get(r._id as string) ?? 0,
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
      custom,
    };
  },
});

// ── Edição ───────────────────────────────────────────────────────────────────

async function reclassify(ctx: GenericMutationCtx<GenericDataModel>, match: (t: Record<string, unknown>) => boolean) {
  const rules = (await ctx.db.query("finRules").collect()) as unknown as Rule[];
  const owners = await loadOwners(ctx.db);
  let changed = 0;
  for (const t of await ctx.db.query("finTx").collect()) {
    if (t.categorySource === "user" || !match(t)) continue;
    const { category, source } = classify(factsOf(t as never, owners), rules);
    if (category !== t.category || source !== t.categorySource) {
      await ctx.db.patch(t._id as GenericId<"finTx">, { category, categorySource: source });
      changed++;
    }
  }
  return changed;
}

function validCategory(slug: string, custom: Custom[]) {
  if (!CATEGORIES.some((c) => c.slug === slug) && !custom.some((c) => c.slug === slug)) throw new Error("Categoria desconhecida.");
}

// Corrige uma movimentação. Com applySimilar, cria a regra (pessoa, loja ou
// descrição) e reclassifica na hora as outras que casam com ela.
export const setCategory = mutation({
  args: { secret: v.string(), txId: v.string(), category: v.string(), applySimilar: v.boolean() },
  handler: async (ctx, { secret, txId, category, applySimilar }) => {
    assertServer(secret);
    const custom = (await ctx.db.query("finCategories").collect()) as unknown as Custom[];
    validCategory(category, custom);
    const row = await ctx.db.query("finTx").withIndex("by_txId", (q) => q.eq("txId", txId)).unique();
    if (!row) throw new Error("Movimentação não encontrada.");
    let changed = 0;
    if (applySimilar) {
      const facts = factsOf(row as never, NO_OWNERS);
      const key = bestRuleFor(facts);
      if (key) {
        const existing = await ctx.db
          .query("finRules")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- índice composto sem tipos gerados
          .withIndex("by_field_value", (q: any) => q.eq("field", key.field).eq("value", key.value))
          .unique();
        const label = (row.counterpartName as string | undefined) ?? (row.merchantName as string | undefined) ?? key.value;
        if (existing) await ctx.db.patch(existing._id, { category });
        else await ctx.db.insert("finRules", { ...key, category, label, createdAt: Date.now() });
        await ctx.db.patch(row._id, { category, categorySource: "rule" });
        changed = await reclassify(ctx, (t) => ruleMatches(factsOf(t as never, NO_OWNERS), { ...key, category }));
        return { changed: changed + 1 };
      }
    }
    await ctx.db.patch(row._id, { category, categorySource: "user" });
    return { changed: 1 };
  },
});

// Volta a movimentação para a classificação automática.
export const resetCategory = mutation({
  args: { secret: v.string(), txId: v.string() },
  handler: async (ctx, { secret, txId }) => {
    assertServer(secret);
    const row = await ctx.db.query("finTx").withIndex("by_txId", (q) => q.eq("txId", txId)).unique();
    if (!row) return;
    await ctx.db.patch(row._id, { categorySource: "none" });
    await reclassify(ctx, (t) => t.txId === txId);
  },
});

export const setNote = mutation({
  args: { secret: v.string(), txId: v.string(), note: v.string() },
  handler: async (ctx, { secret, txId, note }) => {
    assertServer(secret);
    const row = await ctx.db.query("finTx").withIndex("by_txId", (q) => q.eq("txId", txId)).unique();
    if (row) await ctx.db.patch(row._id, { note: note.trim().slice(0, 500) || undefined });
  },
});

export const deleteRule = mutation({
  args: { secret: v.string(), ruleId: v.string() },
  handler: async (ctx, { secret, ruleId }) => {
    assertServer(secret);
    const id = ctx.db.normalizeId("finRules", ruleId);
    if (!id) return;
    const rule = await ctx.db.get(id);
    if (!rule) return;
    await ctx.db.delete(id);
    const gone = rule as unknown as Rule;
    await reclassify(ctx, (t) => t.categorySource === "rule" && ruleMatches(factsOf(t as never, NO_OWNERS), gone));
  },
});

export const addCategory = mutation({
  args: { secret: v.string(), name: v.string(), group: v.string() },
  handler: async (ctx, { secret, name, group }) => {
    assertServer(secret);
    const clean = name.trim().slice(0, 40);
    if (!clean) throw new Error("Dê um nome à categoria.");
    if (!(GROUPS as readonly string[]).includes(group)) throw new Error("Grupo desconhecido.");
    const slug = "u-" + norm(clean).toLowerCase().replace(/\s+/g, "-");
    const existing = await ctx.db.query("finCategories").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (existing) return slug;
    const kind = group === "Receitas" ? "income" : group === "Movimentações internas" ? "internal" : group === "Empresa" ? "business" : "expense";
    await ctx.db.insert("finCategories", { slug, name: clean, group, kind });
    return slug;
  },
});

export const saveGoal = mutation({
  args: {
    secret: v.string(),
    id: v.optional(v.string()),
    name: v.string(),
    target: v.number(),
    deadline: v.optional(v.string()),
    source: v.string(),
    manualValue: v.optional(v.number()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, { secret, id, ...goal }) => {
    assertServer(secret);
    if (!["networth", "investments", "manual", "spend"].includes(goal.source)) throw new Error("Tipo de meta desconhecido.");
    if (!goal.name.trim() || !(goal.target > 0)) throw new Error("Meta precisa de nome e valor.");
    const docId = id ? ctx.db.normalizeId("finGoals", id) : null;
    if (docId) await ctx.db.patch(docId, goal);
    else await ctx.db.insert("finGoals", { ...goal, createdAt: Date.now() });
  },
});

export const deleteGoal = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertServer(secret);
    const docId = ctx.db.normalizeId("finGoals", id);
    if (docId) await ctx.db.delete(docId);
  },
});

export const setBudgetLimit = mutation({
  args: { secret: v.string(), lineId: v.string(), limit: v.union(v.number(), v.null()) },
  handler: async (ctx, { secret, lineId, limit }) => {
    assertServer(secret);
    const row = await ctx.db.query("finBudget").withIndex("by_lineId", (q) => q.eq("lineId", lineId)).unique();
    // null volta ao limite padrão do plano.
    if (limit === null || !(limit >= 0)) {
      if (row) await ctx.db.delete(row._id);
    } else if (row) await ctx.db.patch(row._id, { limit });
    else await ctx.db.insert("finBudget", { lineId, limit });
  },
});
