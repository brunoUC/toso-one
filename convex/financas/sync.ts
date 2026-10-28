import {
  actionGeneric as action,
  internalActionGeneric as internalAction,
  internalMutationGeneric as internalMutation,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import { assertServer } from "../guard";
import { allTransactions, apiKey, get } from "./pluggyClient";
import { classify, norm, type Rule, type TxFacts } from "./taxonomy";
import type { GenericDatabaseReader, GenericDataModel } from "convex/server";

// Sincronização diária com a Pluggy. Na primeira vez de cada banco busca o
// último ano inteiro; depois, os últimos 15 dias (para pegar o que o banco
// lança com atraso e o que deixou de ser "pendente").

const HISTORY_DAYS = 365;
const WINDOW_DAYS = 15;

type PluggyItem = {
  id: string;
  status: string;
  executionStatus?: string;
  lastUpdatedAt?: string;
  consentExpiresAt?: string;
  connector?: { name: string };
};
type PluggyAccount = {
  id: string;
  type: string;
  subtype?: string;
  name?: string;
  marketingName?: string;
  number?: string;
  balance?: number;
  creditData?: { creditLimit?: number; availableCreditLimit?: number; balanceDueDate?: string } | null;
};
type Party = { name?: string; documentNumber?: { value?: string } | null } | null | undefined;
type PluggyTx = {
  id: string;
  date: string;
  description?: string;
  descriptionRaw?: string;
  amount: number;
  amountInAccountCurrency?: number | null;
  type?: string;
  status?: string;
  operationType?: string;
  category?: string;
  merchant?: { name?: string; businessName?: string } | null;
  paymentData?: { paymentMethod?: string; payer?: Party; receiver?: Party } | null;
  creditCardMetadata?: { payeeMCC?: number | string; installmentNumber?: number; totalInstallments?: number } | null;
};
type PluggyInvestment = {
  id: string;
  name?: string;
  type?: string;
  subtype?: string;
  balance?: number;
  amount?: number;
  amountOriginal?: number;
  amountProfit?: number;
  issuer?: string;
  rate?: number;
  rateType?: string;
  dueDate?: string;
  lastMonthRate?: number;
  lastTwelveMonthsRate?: number;
  status?: string;
};

// Data do calendário em Brasília (sem horário de verão desde 2019).
export const brDate = (iso: string | number) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => brDate(Date.now() - n * 86400_000);

function method(t: PluggyTx, accountType: string): string {
  if (accountType === "CREDIT") return "CARTAO";
  const s = `${t.paymentData?.paymentMethod ?? ""} ${t.operationType ?? ""}`.toUpperCase();
  if (s.includes("PIX")) return "PIX";
  if (/\b(TED|DOC|TEV)\b/.test(s)) return "TED";
  if (s.includes("BOLETO") || s.includes("CONVENIO")) return "BOLETO";
  if (s.includes("TARIFA")) return "TARIFA";
  if (s.includes("SAQUE")) return "SAQUE";
  if (s.includes("CARTAO")) return "DEBITO";
  if (s.includes("MESMA_INSTITUICAO") || s.includes("TRANSFERENCIA")) return "TRANSF";
  return "OUTRO";
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || undefined;

// Alguns PIX vêm sem quem recebeu/enviou à parte, só na descrição:
// "PIX ENVIADO - DES FULANO DE TAL 01/10 - DOCTO 123" (Bradesco) ou
// "PIX ENVIADO Fulano de Tal" (Santander).
function nameFromDescription(d: string | undefined): string | undefined {
  const m = (d ?? "").match(/^PIX (?:ENVIADO|RECEBIDO|DEVOLVIDO|QR CODE \w+)(?: - (?:DES|REM):?)? (.+?)(?: \d{2}\/\d{2}| - DOCTO|$)/i);
  return clean(m?.[1]);
}

// A Pluggy chama todo banco do Meu Pluggy de "MeuPluggy"; o nome de verdade
// está no nome da conta corrente ("Banco Bradesco", "XP").
function bankName(accounts: PluggyAccount[], fallback: string): string {
  const acc = accounts.find((a) => a.type === "BANK") ?? accounts[0];
  const name = clean(acc?.name)?.replace(/^Banco\s+/i, "") ?? fallback;
  return name.split(" ")[0] || fallback;
}

function mapTx(t: PluggyTx, acc: { id: string; type: string }, itemId: string, bank: string) {
  const value = Math.abs(t.amountInAccountCurrency ?? t.amount);
  // O sinal da Pluggy muda entre conta e cartão; o "type" não muda.
  const amount = Math.round((t.type === "DEBIT" ? -value : value) * 100) / 100;
  const party = amount < 0 ? t.paymentData?.receiver : t.paymentData?.payer;
  const description = clean(t.description) ?? clean(t.descriptionRaw) ?? "(sem descrição)";
  const mcc = Number(t.creditCardMetadata?.payeeMCC);
  const raw = JSON.stringify(t);
  return {
    txId: t.id,
    accountId: acc.id,
    itemId,
    bank,
    accountType: acc.type,
    date: brDate(t.date),
    at: t.date,
    amount,
    description,
    status: t.status ?? "POSTED",
    method: method(t, acc.type),
    counterpartName: clean(party?.name) ?? (acc.type === "BANK" ? nameFromDescription(description) : undefined),
    counterpartDoc: clean(party?.documentNumber?.value),
    merchantName: clean(t.merchant?.name) ?? clean(t.merchant?.businessName),
    mcc: Number.isFinite(mcc) && mcc > 0 ? mcc : undefined,
    installment: t.creditCardMetadata?.installmentNumber ?? undefined,
    installments: t.creditCardMetadata?.totalInstallments ?? undefined,
    pluggyCategory: clean(t.category),
    raw: raw.length > 30000 ? raw.slice(0, 30000) : raw,
  };
}

export type TxRow = ReturnType<typeof mapTx>;

type FactFields = {
  amount: number;
  accountType: string;
  description: string;
  method: string;
  merchantName?: string;
  counterpartName?: string;
  counterpartDoc?: string;
  mcc?: number;
  pluggyCategory?: string;
};

export type Owners = { docs: string[]; names: string[] };
export const NO_OWNERS: Owners = { docs: [], names: [] };

// CPF e nomes do titular, juntando todos os bancos (é a mesma pessoa).
export async function loadOwners(db: GenericDatabaseReader<GenericDataModel>): Promise<Owners> {
  const items = await db.query("finItems").collect();
  return {
    docs: [...new Set(items.flatMap((i) => (i.ownerDocs as string[] | undefined) ?? []))],
    names: [...new Set(items.flatMap((i) => (i.ownerNames as string[] | undefined) ?? []))],
  };
}

export function factsOf(t: FactFields, owners: Owners): TxFacts {
  return {
    amount: t.amount,
    accountType: t.accountType,
    description: t.description,
    merchantName: t.merchantName ?? null,
    counterpartName: t.counterpartName ?? null,
    counterpartDoc: t.counterpartDoc ?? null,
    ownerDocs: owners.docs,
    ownerNames: owners.names,
    mcc: t.mcc ?? null,
    pluggyCategory: t.pluggyCategory ?? null,
    paymentMethod: t.method,
  };
}

const ref = {
  upsertItem: makeFunctionReference<"mutation">("financas/sync:upsertItem"),
  upsertAccount: makeFunctionReference<"mutation">("financas/sync:upsertAccount"),
  upsertTx: makeFunctionReference<"mutation">("financas/sync:upsertTx"),
  prunePending: makeFunctionReference<"mutation">("financas/sync:prunePending"),
  upsertInvestments: makeFunctionReference<"mutation">("financas/sync:upsertInvestments"),
  snapshot: makeFunctionReference<"mutation">("financas/sync:snapshot"),
  items: makeFunctionReference<"query">("financas/data:itemsInternal"),
  syncAll: makeFunctionReference<"action">("financas/sync:syncAll"),
  classifyAi: makeFunctionReference<"action">("financas/ai:classifyPending"),
};

// ── Ações ────────────────────────────────────────────────────────────────────

export const syncAll = internalAction({
  args: { full: v.optional(v.boolean()) },
  handler: async (ctx, { full }) => {
    const key = await apiKey();
    const items = (await ctx.runQuery(ref.items, {})) as { itemId: string; historyFrom?: string; ownerDocs: string[]; ownerNames: string[] }[];
    const report: Record<string, unknown>[] = [];

    for (const stored of items) {
      const started = Date.now();
      try {
        const item = await get<PluggyItem>(key, `/items/${stored.itemId}`);
        let ownerDocs = stored.ownerDocs;
        let ownerNames = stored.ownerNames;
        try {
          const identity = await get<{ document?: string; taxNumber?: string; fullName?: string }>(key, `/identity?itemId=${stored.itemId}`);
          const doc = identity.document ?? identity.taxNumber;
          if (doc) ownerDocs = [...new Set([...ownerDocs, doc])];
          if (identity.fullName) ownerNames = [...new Set([...ownerNames, norm(identity.fullName)])];
        } catch {
          // Nem todo banco entrega a identidade; fica o que já se sabia.
        }

        const firstTime = full || !stored.historyFrom;
        const from = firstTime ? daysAgo(HISTORY_DAYS) : daysAgo(WINDOW_DAYS);

        const accounts = (await get<{ results: PluggyAccount[] }>(key, `/accounts?itemId=${stored.itemId}`)).results;
        const bank = bankName(accounts, item.connector?.name ?? "Banco");
        // Grava o titular antes das movimentações, para elas já saírem certas.
        await ctx.runMutation(ref.upsertItem, { itemId: stored.itemId, bank, ownerDocs, ownerNames, lastSyncAt: Date.now(), lastSyncError: "" });
        let txCount = 0;
        for (const acc of accounts) {
          await ctx.runMutation(ref.upsertAccount, {
            accountId: acc.id,
            itemId: stored.itemId,
            bank,
            type: acc.type,
            subtype: acc.subtype,
            name: clean(acc.marketingName) ?? clean(acc.name) ?? acc.type,
            number: clean(acc.number),
            balance: acc.balance ?? 0,
            creditLimit: acc.creditData?.creditLimit ?? undefined,
            availableCredit: acc.creditData?.availableCreditLimit ?? undefined,
            dueDate: acc.creditData?.balanceDueDate ? brDate(acc.creditData.balanceDueDate) : undefined,
          });
          const txs = await allTransactions<PluggyTx>(key, acc.id, from);
          const rows = txs.map((t) => mapTx(t, acc, stored.itemId, bank));
          // O banco marca algumas transferências como "mesma titularidade":
          // o nome de quem está do outro lado nelas é o meu.
          const learned = rows.filter((r) => /same person/i.test(r.pluggyCategory ?? "") && r.counterpartName).map((r) => norm(r.counterpartName));
          if (learned.some((n) => !ownerNames.includes(n))) {
            ownerNames = [...new Set([...ownerNames, ...learned])];
            await ctx.runMutation(ref.upsertItem, { itemId: stored.itemId, ownerNames, lastSyncAt: Date.now(), lastSyncError: "" });
          }
          for (let i = 0; i < rows.length; i += 100) {
            await ctx.runMutation(ref.upsertTx, { rows: rows.slice(i, i + 100) });
          }
          await ctx.runMutation(ref.prunePending, { accountId: acc.id, from, seen: rows.map((r) => r.txId) });
          txCount += rows.length;
        }

        let investments: PluggyInvestment[] = [];
        try {
          for (let page = 1; page <= 20; page++) {
            const res = await get<{ results: PluggyInvestment[]; totalPages?: number }>(key, `/investments?itemId=${stored.itemId}&page=${page}`);
            investments.push(...res.results);
            if (!res.totalPages || page >= res.totalPages) break;
          }
        } catch {
          investments = [];
        }
        await ctx.runMutation(ref.upsertInvestments, {
          itemId: stored.itemId,
          bank,
          rows: investments
            .filter((i) => i.status !== "TOTAL_WITHDRAWAL")
            .map((i) => ({
              investmentId: i.id,
              name: clean(i.name) ?? i.type ?? "Investimento",
              type: i.type ?? "OTHER",
              subtype: i.subtype ?? undefined,
              balance: i.balance ?? i.amount ?? 0,
              invested: i.amountOriginal ?? undefined,
              profit: i.amountProfit ?? undefined,
              issuer: clean(i.issuer),
              rate: i.rate ?? undefined,
              rateType: i.rateType ?? undefined,
              dueDate: i.dueDate ? brDate(i.dueDate) : undefined,
              lastMonthRate: i.lastMonthRate ?? undefined,
              lastTwelveMonthsRate: i.lastTwelveMonthsRate ?? undefined,
              raw: JSON.stringify(i).slice(0, 30000),
            })),
        });

        await ctx.runMutation(ref.upsertItem, {
          itemId: stored.itemId,
          bank,
          status: item.status,
          executionStatus: item.executionStatus,
          bankUpdatedAt: item.lastUpdatedAt,
          consentExpiresAt: item.consentExpiresAt,
          ownerDocs,
          ownerNames,
          lastSyncAt: Date.now(),
          lastSyncError: "",
          historyFrom: firstTime ? from : stored.historyFrom,
        });
        report.push({ bank, accounts: accounts.length, transactions: txCount, investments: investments.length, ms: Date.now() - started });
      } catch (err) {
        const message = (err as Error).message.slice(0, 300);
        await ctx.runMutation(ref.upsertItem, { itemId: stored.itemId, lastSyncAt: Date.now(), lastSyncError: message });
        report.push({ itemId: stored.itemId, error: message });
      }
    }

    await ctx.runMutation(ref.snapshot, {});
    if (process.env.ANTHROPIC_API_KEY) await ctx.scheduler.runAfter(0, ref.classifyAi, {});
    return report;
  },
});

// Botão "Atualizar agora" do app.
export const syncNow = action({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    await ctx.scheduler.runAfter(0, ref.syncAll, {});
  },
});

// ── Gravação ─────────────────────────────────────────────────────────────────

export const addItems = internalMutation({
  args: { itemIds: v.array(v.string()) },
  handler: async (ctx, { itemIds }) => {
    for (const itemId of itemIds) {
      const existing = await ctx.db.query("finItems").withIndex("by_itemId", (q) => q.eq("itemId", itemId)).unique();
      if (!existing) await ctx.db.insert("finItems", { itemId, bank: "…", status: "NEW", ownerDocs: [], ownerNames: [] });
    }
  },
});

export const upsertItem = internalMutation({
  args: {
    itemId: v.string(),
    bank: v.optional(v.string()),
    status: v.optional(v.string()),
    executionStatus: v.optional(v.string()),
    bankUpdatedAt: v.optional(v.string()),
    consentExpiresAt: v.optional(v.string()),
    ownerDocs: v.optional(v.array(v.string())),
    ownerNames: v.optional(v.array(v.string())),
    lastSyncAt: v.number(),
    lastSyncError: v.string(),
    historyFrom: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, ...patch }) => {
    const row = await ctx.db.query("finItems").withIndex("by_itemId", (q) => q.eq("itemId", itemId)).unique();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined));
    if (row) await ctx.db.patch(row._id, clean);
  },
});

export const upsertAccount = internalMutation({
  args: {
    accountId: v.string(),
    itemId: v.string(),
    bank: v.string(),
    type: v.string(),
    subtype: v.optional(v.string()),
    name: v.string(),
    number: v.optional(v.string()),
    balance: v.number(),
    creditLimit: v.optional(v.number()),
    availableCredit: v.optional(v.number()),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, acc) => {
    const row = await ctx.db.query("finAccounts").withIndex("by_accountId", (q) => q.eq("accountId", acc.accountId)).unique();
    if (row) await ctx.db.replace(row._id, { ...acc, updatedAt: Date.now() });
    else await ctx.db.insert("finAccounts", { ...acc, updatedAt: Date.now() });
  },
});

const txRow = v.object({
  txId: v.string(),
  accountId: v.string(),
  itemId: v.string(),
  bank: v.string(),
  accountType: v.string(),
  date: v.string(),
  at: v.string(),
  amount: v.number(),
  description: v.string(),
  status: v.string(),
  method: v.string(),
  counterpartName: v.optional(v.string()),
  counterpartDoc: v.optional(v.string()),
  merchantName: v.optional(v.string()),
  mcc: v.optional(v.number()),
  installment: v.optional(v.number()),
  installments: v.optional(v.number()),
  pluggyCategory: v.optional(v.string()),
  raw: v.string(),
});

export const upsertTx = internalMutation({
  args: { rows: v.array(txRow) },
  handler: async (ctx, { rows }) => {
    const rules = (await ctx.db.query("finRules").collect()) as unknown as Rule[];
    const owners = await loadOwners(ctx.db);
    const now = Date.now();
    for (const { raw, ...r } of rows) {
      const rawRow = await ctx.db.query("finTxRaw").withIndex("by_txId", (q) => q.eq("txId", r.txId)).unique();
      if (rawRow) await ctx.db.patch(rawRow._id, { raw });
      else await ctx.db.insert("finTxRaw", { txId: r.txId, raw });
      const row = await ctx.db.query("finTx").withIndex("by_txId", (q) => q.eq("txId", r.txId)).unique();
      // O que ele escolheu à mão nunca é sobrescrito; o resto é reclassificado
      // (as regras podem ter mudado desde a última vez).
      if (row && (row.categorySource === "user" || row.categorySource === "ai")) {
        await ctx.db.patch(row._id, { ...r, syncedAt: now });
        continue;
      }
      const { category, source } = classify(factsOf(r, owners), rules);
      if (row) await ctx.db.patch(row._id, { ...r, category, categorySource: source, syncedAt: now });
      else await ctx.db.insert("finTx", { ...r, category, categorySource: source, syncedAt: now });
    }
  },
});

// Lançamento pendente que sumiu da Pluggy virou outro (o definitivo, com
// outro id) ou foi cancelado: sai daqui também.
export const prunePending = internalMutation({
  args: { accountId: v.string(), from: v.string(), seen: v.array(v.string()) },
  handler: async (ctx, { accountId, from, seen }) => {
    const ids = new Set(seen);
    const rows = await ctx.db
      .query("finTx")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- índice composto sem tipos gerados
      .withIndex("by_account_date", (q: any) => q.eq("accountId", accountId).gte("date", from))
      .collect();
    for (const r of rows) {
      if (r.status !== "PENDING" || ids.has(r.txId as string)) continue;
      const raw = await ctx.db.query("finTxRaw").withIndex("by_txId", (q) => q.eq("txId", r.txId as string)).unique();
      if (raw) await ctx.db.delete(raw._id);
      await ctx.db.delete(r._id);
    }
  },
});

const invRow = v.object({
  investmentId: v.string(),
  name: v.string(),
  type: v.string(),
  subtype: v.optional(v.string()),
  balance: v.number(),
  invested: v.optional(v.number()),
  profit: v.optional(v.number()),
  issuer: v.optional(v.string()),
  rate: v.optional(v.number()),
  rateType: v.optional(v.string()),
  dueDate: v.optional(v.string()),
  lastMonthRate: v.optional(v.number()),
  lastTwelveMonthsRate: v.optional(v.number()),
  raw: v.string(),
});

export const upsertInvestments = internalMutation({
  args: { itemId: v.string(), bank: v.string(), rows: v.array(invRow) },
  handler: async (ctx, { itemId, bank, rows }) => {
    const now = Date.now();
    const seen = new Set(rows.map((r) => r.investmentId));
    for (const r of rows) {
      const row = await ctx.db.query("finInvestments").withIndex("by_investmentId", (q) => q.eq("investmentId", r.investmentId)).unique();
      const doc = { ...r, itemId, bank, updatedAt: now, gone: false };
      if (row) await ctx.db.replace(row._id, doc);
      else await ctx.db.insert("finInvestments", doc);
    }
    const all = await ctx.db.query("finInvestments").collect();
    for (const r of all) if (r.itemId === itemId && !seen.has(r.investmentId as string) && !r.gone) await ctx.db.patch(r._id, { gone: true });
  },
});

export const snapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("finAccounts").collect();
    const inv = (await ctx.db.query("finInvestments").collect()).filter((i) => !i.gone);
    const cash = accounts.filter((a) => a.type === "BANK").reduce((s, a) => s + (a.balance as number), 0);
    const cardDebt = accounts.filter((a) => a.type === "CREDIT").reduce((s, a) => s + Math.max(0, a.balance as number), 0);
    const investments = inv.reduce((s, i) => s + (i.balance as number), 0);
    const invested = inv.reduce((s, i) => s + ((i.invested as number | undefined) ?? (i.balance as number)), 0);
    const date = brDate(Date.now());
    const doc = { date, cash, investments, cardDebt, invested, total: cash + investments - cardDebt };
    const row = await ctx.db.query("finNetWorth").withIndex("by_date", (q) => q.eq("date", date)).unique();
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("finNetWorth", doc);
  },
});
