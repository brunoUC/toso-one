import { internalQueryGeneric as internalQuery, makeFunctionReference, mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import type { GenericDatabaseReader, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "../guard";

// Análise semanal da carteira da XP. Aqui ficam os números (todos calculados
// pelo código, nada inventado pelo modelo) e a leitura/gravação. A pesquisa
// e o texto vêm de uma tarefa agendada do Claude Code (sábado de manhã), que
// lê os números e devolve a análise pela rota /api/agente/semana.
//
// Rendimento da semana = saldo de hoje − saldo de 7 dias atrás − aportes +
// resgates (e juros/amortizações pagos em dinheiro) no meio. O saldo de cada
// dia vem de finInvSnap, gravado a cada leitura dos bancos.

export const isXp = (bank: string) => /^xp\b/i.test(bank);

const DAY = 86400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export const brToday = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export type WeekItem = {
  name: string;
  type: string;
  subtype: string | null;
  issuer: string | null;
  rate: number | null;
  rateType: string | null;
  dueDate: string | null;
  balance: number;
  invested: number | null;
  lastMonthRate: number | null;
  lastTwelveMonthsRate: number | null;
  weekGain: number | null; // null = sem saldo de 7 dias atrás
};

export type WeekNumbers = {
  weekStart: string; // dia da base (saldo de partida)
  weekEnd: string;
  hasBase: boolean; // existe fotografia de ~7 dias atrás
  start: number; // investimentos XP no começo
  end: number; // investimentos XP hoje
  inflow: number; // aplicado na semana
  outflow: number; // resgatado / pago em dinheiro na semana
  gain: number; // rendimento da semana (bruto de IR)
  gainPct: number | null;
  cdiPct: number | null; // CDI acumulado no mesmo período (preenchido no run)
  pctOfCdi: number | null;
  xpCash: number; // saldo parado na conta da XP
  otherCash: { bank: string; balance: number }[]; // contas correntes dos outros bancos
  otherInvested: number; // investimentos fora da XP
  items: WeekItem[];
};

// O que o Claude devolve (/api/agente/semana) e o painel mostra.
export type WeekReport = {
  headline: string;
  summary: string;
  market: string[];
  portfolio: string[];
  opportunities: { title: string; product: string; liquidity: string; rate: string; minimum: string; tax: string; why: string; how: string }[];
  action: string;
  risks: string[];
};

type Inv = Record<string, unknown> & { investmentId: string; bank: string; balance: number; gone?: boolean };
type InvTx = { investmentId: string; date: string; type: string; movementType?: string; amount: number };

// Sinal do dinheiro que entra (+) ou sai (−) do investimento.
function flowOf(t: InvTx): number {
  const a = Math.abs(t.amount);
  if (t.type === "BUY") return a;
  if (t.type === "SELL" || t.type === "INTEREST" || t.type === "AMORTIZATION") return -a;
  if (t.movementType === "CREDIT") return a;
  if (t.movementType === "DEBIT") return -a;
  return 0;
}

export function weekNumbers(
  invs: Inv[],
  snaps: { date: string; investmentId: string; balance: number }[],
  invTx: InvTx[],
  accounts: { bank: string; type: string; subtype?: string; balance: number }[],
  today: string,
): WeekNumbers {
  const xp = invs.filter((i) => isXp(i.bank));
  const ids = new Set(xp.map((i) => i.investmentId));
  // Base: a fotografia mais recente com pelo menos 7 dias.
  const target = shift(today, -7);
  const baseDate = [...new Set(snaps.filter((s) => s.date <= target).map((s) => s.date))].sort().pop() ?? null;
  const base = new Map(snaps.filter((s) => s.date === baseDate && ids.has(s.investmentId)).map((s) => [s.investmentId, s.balance]));
  const weekStart = baseDate ?? target;

  let inflow = 0;
  let outflow = 0;
  const flowBy = new Map<string, number>();
  for (const t of invTx) {
    if (!ids.has(t.investmentId) || t.date <= weekStart || t.date > today) continue;
    const f = flowOf(t);
    if (f > 0) inflow += f;
    else outflow -= f;
    flowBy.set(t.investmentId, (flowBy.get(t.investmentId) ?? 0) + f);
  }

  const items: WeekItem[] = [];
  let start = 0;
  let end = 0;
  for (const i of xp) {
    const now = i.gone ? 0 : i.balance;
    const was = base.get(i.investmentId);
    // Resgatado antes da base: não faz parte da semana.
    if (i.gone && was === undefined && !flowBy.has(i.investmentId)) continue;
    start += was ?? 0;
    end += now;
    if (i.gone) continue;
    items.push({
      name: i.name as string,
      type: i.type as string,
      subtype: (i.subtype as string | undefined) ?? null,
      issuer: (i.issuer as string | undefined) ?? null,
      rate: (i.rate as number | undefined) ?? null,
      rateType: (i.rateType as string | undefined) ?? null,
      dueDate: (i.dueDate as string | undefined) ?? null,
      balance: i.balance,
      invested: (i.invested as number | undefined) ?? null,
      lastMonthRate: (i.lastMonthRate as number | undefined) ?? null,
      lastTwelveMonthsRate: (i.lastTwelveMonthsRate as number | undefined) ?? null,
      weekGain: baseDate && (was !== undefined || flowBy.has(i.investmentId)) ? now - (was ?? 0) - (flowBy.get(i.investmentId) ?? 0) : null,
    });
  }
  const hasBase = Boolean(baseDate) && base.size > 0;
  const gain = hasBase ? end - start - inflow + outflow : 0;
  // Rendimento sobre o capital médio (o que entrou no meio conta pela metade).
  const capital = start + (inflow - outflow) / 2;

  const checking = accounts.filter((a) => a.type === "BANK");
  return {
    weekStart,
    weekEnd: today,
    hasBase,
    start,
    end,
    inflow,
    outflow,
    gain,
    gainPct: hasBase && capital > 0 ? gain / capital : null,
    cdiPct: null,
    pctOfCdi: null,
    xpCash: checking.filter((a) => isXp(a.bank)).reduce((s, a) => s + a.balance, 0),
    otherCash: checking.filter((a) => !isXp(a.bank)).map((a) => ({ bank: a.bank, balance: a.balance })),
    otherInvested: invs.filter((i) => !isXp(i.bank) && !i.gone).reduce((s, i) => s + i.balance, 0),
    items: items.sort((a, b) => b.balance - a.balance),
  };
}

// ── Convex ──────────────────────────────────────────────────────────────────

const pushSend = makeFunctionReference<"action">("push:send");

async function numbersNow(db: GenericDatabaseReader<GenericDataModel>): Promise<WeekNumbers> {
  const today = brToday();
  const invs = (await db.query("finInvestments").collect()) as unknown as Inv[];
  const snaps = (await db
    .query("finInvSnap")
    .withIndex("by_date", (q) => q.gte("date", shift(today, -21)))
    .collect()) as unknown as { date: string; investmentId: string; balance: number }[];
  const invTx = (await db.query("finInvTx").collect()) as unknown as InvTx[];
  const accounts = (await db.query("finAccounts").collect()) as unknown as { bank: string; type: string; subtype?: string; balance: number }[];
  return weekNumbers(invs, snaps, invTx, accounts, today);
}

// Os números da semana, para a sessão do Claude que escreve a análise.
export const numbers = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    return numbersNow(ctx.db);
  },
});

export const numbersInternal = internalQuery({ args: {}, handler: (ctx) => numbersNow(ctx.db) });

// A análise pronta (já validada pela rota /api/agente/semana). Uma por dia:
// mandar de novo no mesmo dia substitui. Avisa os aparelhos por push.
export const save = mutation({
  args: { secret: v.string(), weekEnd: v.string(), numbers: v.string(), report: v.string(), sources: v.string(), push: v.string() },
  handler: async (ctx, { secret, push, ...doc }) => {
    assertServer(secret);
    const row = await ctx.db.query("finWeekly").withIndex("by_weekEnd", (q) => q.eq("weekEnd", doc.weekEnd)).unique();
    const now = Date.now();
    const full = { ...doc, status: "ok", startedAt: now, finishedAt: now };
    if (row) await ctx.db.replace(row._id, full);
    else await ctx.db.insert("finWeekly", full);
    if (push) await ctx.scheduler.runAfter(0, pushSend, { title: "Semana na XP", body: push.slice(0, 220), url: "/financas/painel", tag: `semana-${doc.weekEnd}` });
  },
});

// As últimas análises, para o painel.
export const latest = query({
  args: { secret: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { secret, limit }) => {
    assertServer(secret);
    const rows = await ctx.db.query("finWeekly").withIndex("by_weekEnd").order("desc").take(limit ?? 6);
    return rows.map((r) => ({
      weekEnd: r.weekEnd as string,
      status: r.status as string,
      numbers: r.numbers as string,
      report: (r.report as string | undefined) ?? null,
      sources: (r.sources as string | undefined) ?? null,
      error: (r.error as string | undefined) ?? null,
      startedAt: r.startedAt as number,
      finishedAt: (r.finishedAt as number | undefined) ?? null,
    }));
  },
});
