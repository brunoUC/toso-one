import { internalActionGeneric as internalAction, internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, makeFunctionReference } from "convex/server";
import { v } from "convex/values";

// "Transfira antes de a fatura fechar": de 1 a 3 dias antes do fechamento de
// cada cartão, compara a fatura com o saldo da conta do mesmo banco (é dela
// que o débito sai) e, se não cobre, diz quanto mandar e de onde: primeiro da
// XP, depois do banco com mais folga. Manda um push por banco e fechamento.

const WINDOW_DAYS = 3;
// Sem a data de fechamento da Pluggy, estima pelo vencimento: a maioria dos
// cartões fecha 7 dias antes de vencer.
const CLOSE_BEFORE_DUE = 7;

export type AccLite = {
  accountId: string;
  itemId: string;
  bank: string;
  type: string; // BANK | CREDIT
  subtype?: string | null;
  balance: number;
  dueDate?: string | null;
  closeDate?: string | null;
};
export type InvBank = { bank: string; balance: number };

export type CardPlan = {
  itemId: string;
  bank: string;
  closeDate: string;
  estimated: boolean; // fechamento estimado pelo vencimento
  daysToClose: number;
  bill: number; // soma das faturas deste banco que fecham na janela
  cash: number; // saldo da conta que paga
  shortfall: number; // quanto falta (0 = cobre)
  transfer: number; // quanto mandar, arredondado com folga
  from: string | null; // "XP", outro banco ou null (nenhum cobre sozinho)
  title: string;
  text: string;
};

const DAY = 86400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY);
const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const isXp = (bank: string) => /^xp\b/i.test(bank);

// A conta que paga o cartão: a corrente do mesmo banco (a de maior saldo, se
// houver mais de uma).
function payingAccount(accounts: AccLite[], itemId: string): AccLite | null {
  const own = accounts.filter((a) => a.itemId === itemId && a.type === "BANK");
  const checking = own.filter((a) => (a.subtype ?? "").toUpperCase().includes("CHECKING"));
  const pool = checking.length ? checking : own;
  return pool.sort((a, b) => b.balance - a.balance)[0] ?? null;
}

export function cardPlans(accounts: AccLite[], investments: InvBank[], today: string, windowDays = WINDOW_DAYS): CardPlan[] {
  const byItem = new Map<string, { bank: string; close: string; estimated: boolean; bill: number }>();
  for (const c of accounts) {
    if (c.type !== "CREDIT") continue;
    const close = c.closeDate ?? (c.dueDate ? shift(c.dueDate, -CLOSE_BEFORE_DUE) : null);
    if (!close) continue;
    const d = days(today, close);
    if (d < 1 || d > windowDays) continue;
    const cur = byItem.get(c.itemId);
    const bill = Math.max(0, c.balance);
    if (cur) {
      cur.bill += bill;
      if (close < cur.close) cur.close = close;
      cur.estimated ||= !c.closeDate;
    } else byItem.set(c.itemId, { bank: c.bank, close, estimated: !c.closeDate, bill });
  }

  // Quanto cada banco pode mandar: o saldo menos o que os cartões dele devem.
  const surplus = (itemId: string) => {
    const acc = payingAccount(accounts, itemId);
    if (!acc) return 0;
    const owed = accounts.filter((a) => a.itemId === itemId && a.type === "CREDIT").reduce((s, a) => s + Math.max(0, a.balance), 0);
    return acc.balance - owed;
  };
  const xpInvested = investments.filter((i) => isXp(i.bank)).reduce((s, i) => s + i.balance, 0);
  const xpItem = accounts.find((a) => isXp(a.bank))?.itemId ?? null;

  const out: CardPlan[] = [];
  for (const [itemId, g] of byItem) {
    const acc = payingAccount(accounts, itemId);
    const cash = acc?.balance ?? 0;
    const shortfall = Math.max(0, Math.round((g.bill - cash) * 100) / 100);
    // Folga de 10% (mínimo R$ 100) para o que ainda cair até o vencimento,
    // arredondado para a centena de cima.
    const transfer = shortfall > 0 ? Math.ceil((shortfall + Math.max(100, shortfall * 0.1)) / 100) * 100 : 0;
    const daysToClose = days(today, g.close);
    const when = `fecha ${ddmm(g.close)}${g.estimated ? " (previsão)" : ""}`;
    let from: string | null = null;
    let action = "";
    if (transfer > 0) {
      if (isXp(g.bank)) {
        // Cartão da própria XP: o dinheiro sai dos investimentos de lá.
        if (xpInvested >= transfer) {
          from = "XP";
          action = `Resgate ${brl(transfer)} de um investimento D+0 da XP para a conta XP.`;
        }
      } else if (xpItem && Math.max(0, surplus(xpItem)) + xpInvested >= transfer) {
        from = "XP";
        action = `Transfira ${brl(transfer)} da XP para o ${g.bank}.`;
      }
      if (!from) {
        const best = [...new Set(accounts.filter((a) => a.type === "BANK" && a.itemId !== itemId).map((a) => a.itemId))]
          .map((id) => ({ id, bank: accounts.find((a) => a.itemId === id)!.bank, free: surplus(id) }))
          .sort((a, b) => b.free - a.free)[0];
        if (best && best.free >= transfer) {
          from = best.bank;
          action = `Transfira ${brl(transfer)} do ${best.bank} para o ${g.bank}.`;
        } else action = `Faltam ${brl(shortfall)} e nenhuma conta cobre sozinha: junte ${brl(transfer)} no ${g.bank}.`;
      }
    }
    out.push({
      itemId,
      bank: g.bank,
      closeDate: g.close,
      estimated: g.estimated,
      daysToClose,
      bill: g.bill,
      cash,
      shortfall,
      transfer,
      from,
      title: transfer > 0 ? `${g.bank}: transfira ${brl(transfer)}` : `${g.bank}: fatura coberta`,
      text:
        transfer > 0
          ? `A fatura ${when} em ${brl(g.bill)} e a conta tem ${brl(cash)}. ${action}`
          : `A fatura ${when} em ${brl(g.bill)} e a conta tem ${brl(cash)}. Não precisa transferir.`,
    });
  }
  return out.sort((a, b) => (a.closeDate < b.closeDate ? -1 : 1));
}

// ── Convex ──────────────────────────────────────────────────────────────────

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

const ref = {
  pending: makeFunctionReference<"query">("financas/cards:pending"),
  record: makeFunctionReference<"mutation">("financas/cards:record"),
  send: makeFunctionReference<"action">("push:send"),
};

export const pending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const accounts = (await ctx.db.query("finAccounts").collect()) as unknown as AccLite[];
    const investments = ((await ctx.db.query("finInvestments").collect()) as unknown as (InvBank & { gone?: boolean })[]).filter((i) => !i.gone);
    const plans = cardPlans(accounts, investments, today());
    const out: CardPlan[] = [];
    for (const p of plans) {
      if (!p.transfer) continue;
      const sent = await ctx.db
        .query("finCardAlerts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- índice composto sem tipos gerados
        .withIndex("by_item_close", (q: any) => q.eq("itemId", p.itemId).eq("closeDate", p.closeDate))
        .first();
      if (!sent) out.push(p);
    }
    return out;
  },
});

export const record = internalMutation({
  args: { itemId: v.string(), bank: v.string(), closeDate: v.string(), text: v.string(), transfer: v.number() },
  handler: async (ctx, a) => {
    await ctx.db.insert("finCardAlerts", { ...a, sentAt: Date.now() });
  },
});

// Todo dia de manhã, depois da leitura das 06:17 (convex/crons.ts).
export const check = internalAction({
  args: {},
  handler: async (ctx) => {
    const plans = (await ctx.runQuery(ref.pending, {})) as CardPlan[];
    for (const p of plans) {
      await ctx.runAction(ref.send, { title: p.title, body: p.text, url: "/financas/painel", tag: `fatura-${p.itemId}-${p.closeDate}` });
      await ctx.runMutation(ref.record, { itemId: p.itemId, bank: p.bank, closeDate: p.closeDate, text: p.text, transfer: p.transfer });
    }
    return plans.map((p) => p.text);
  },
});
