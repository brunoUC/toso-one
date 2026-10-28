// Números do painel a partir das movimentações. Puro (sem banco), para dar
// para conferir as contas lendo um arquivo só.

import { categoryOf, descriptionKey, norm, type Custom, type Kind } from "./taxonomy";

export type LeanTx = {
  txId: string;
  accountId: string;
  bank: string;
  accountType: string;
  date: string;
  amount: number;
  description: string;
  status: string;
  method: string;
  counterpartName?: string;
  merchantName?: string;
  mcc?: number;
  installment?: number;
  installments?: number;
  pluggyCategory?: string;
  category: string;
  categorySource: string;
  note?: string;
};

export type Snapshot = { date: string; cash: number; investments: number; cardDebt: number; total: number; invested: number };

export type MonthAgg = {
  key: string; // AAAA-MM
  label: string; // out/26
  partial: boolean;
  income: number;
  expense: number;
  byCategory: Record<string, number>; // gasto líquido (estornos abatem)
  byGroup: Record<string, number>;
  incomeByCategory: Record<string, number>;
};

export type Recurring = { label: string; category: string; monthly: number; months: number; lastDate: string };
export type Insight = { icon: string; title: string; text: string; tone?: "good" | "bad" };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`;
const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

export function kindOf(slug: string, custom: Custom[]): Kind {
  return categoryOf(slug, custom).kind;
}

function lastMonths(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthly(txs: LeanTx[], custom: Custom[], today: string, n = 13): MonthAgg[] {
  const keys = lastMonths(today, n);
  const map = new Map<string, MonthAgg>(
    keys.map((key) => [
      key,
      { key, label: monthLabel(key), partial: key === today.slice(0, 7), income: 0, expense: 0, byCategory: {}, byGroup: {}, incomeByCategory: {} },
    ]),
  );
  for (const t of txs) {
    const m = map.get(t.date.slice(0, 7));
    if (!m) continue;
    const cat = categoryOf(t.category, custom);
    if (cat.kind === "expense") {
      const spend = -t.amount;
      m.expense += spend;
      m.byCategory[cat.slug] = (m.byCategory[cat.slug] ?? 0) + spend;
      m.byGroup[cat.group] = (m.byGroup[cat.group] ?? 0) + spend;
    } else if (cat.kind === "income") {
      m.income += t.amount;
      m.incomeByCategory[cat.slug] = (m.incomeByCategory[cat.slug] ?? 0) + t.amount;
    }
  }
  return keys.map((k) => map.get(k)!);
}

// Cobranças que se repetem todo mês com valor parecido (assinaturas, plano,
// condomínio...). Parcelas ficam de fora: elas acabam.
export function recurring(txs: LeanTx[], custom: Custom[], today: string): Recurring[] {
  const window = new Set(lastMonths(today, 7).slice(0, 6)); // 6 meses fechados
  const groups = new Map<string, LeanTx[]>();
  for (const t of txs) {
    if (t.amount >= 0 || (t.installments ?? 0) > 1) continue;
    if (!window.has(t.date.slice(0, 7))) continue;
    if (categoryOf(t.category, custom).kind !== "expense") continue;
    const key = norm(t.merchantName) || norm(t.counterpartName) || descriptionKey(t.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: Recurring[] = [];
  for (const [, list] of groups) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    if (months.size < 3 || list.length > months.size * 1.5) continue;
    const values = list.map((t) => -t.amount).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    if (values[values.length - 1] > median * 1.35 || values[0] < median * 0.65) continue;
    const last = list.reduce((a, t) => (t.date > a.date ? t : a));
    out.push({
      label: last.merchantName ?? last.counterpartName ?? last.description,
      category: last.category,
      monthly: median,
      months: months.size,
      lastDate: last.date,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

// Patrimônio no fim de cada mês, pelas fotografias diárias. Não dá para
// reconstruir o passado desfazendo movimentações: parte do dinheiro passa por
// contas que não estão conectadas (e o rendimento não aparece no extrato).
export function netWorthSeries(snapshots: Snapshot[], today: string): { date: string; label: string; total: number; estimated: boolean }[] {
  const byMonth = new Map<string, Snapshot>();
  for (const s of snapshots) if (s.date <= today) byMonth.set(s.date.slice(0, 7), s); // a última de cada mês
  return [...byMonth.values()].slice(-13).map((s) => ({ date: s.date, label: monthLabel(s.date), total: s.total, estimated: false }));
}

export function insights(
  months: MonthAgg[],
  rec: Recurring[],
  unclassified: { count: number; amount: number },
  invest: { balance: number; profit: number },
): Insight[] {
  const out: Insight[] = [];
  const closed = months.filter((m) => !m.partial);
  const last = closed[closed.length - 1];
  const prev3 = closed.slice(-4, -1);

  if (last && prev3.length === 3) {
    let best: { group: string; diff: number; now: number; avg: number } | null = null;
    for (const group of Object.keys(last.byGroup)) {
      const now = last.byGroup[group];
      const avg = prev3.reduce((s, m) => s + (m.byGroup[group] ?? 0), 0) / 3;
      if (avg < 200 && now < 200) continue;
      const diff = now - avg;
      if (!best || Math.abs(diff) > Math.abs(best.diff)) best = { group, diff, now, avg };
    }
    if (best && Math.abs(best.diff) >= 150) {
      const pctTxt = best.avg > 0 ? ` (${best.diff > 0 ? "+" : "−"}${Math.abs(Math.round((best.diff / best.avg) * 100))}%)` : "";
      out.push({
        icon: best.diff > 0 ? "↗" : "↘",
        tone: best.diff > 0 ? "bad" : "good",
        title: `${best.group} ${best.diff > 0 ? "subiu" : "caiu"} ${brl(Math.abs(best.diff))} em ${last.label}${pctTxt}.`,
        text: `Foram ${brl(best.now)} contra ${brl(best.avg)} de média nos 3 meses anteriores.`,
      });
    }
  }

  if (closed.length >= 3) {
    const recent = closed.slice(-6);
    const inc = recent.reduce((s, m) => s + m.income, 0);
    const exp = recent.reduce((s, m) => s + m.expense, 0);
    if (inc > 0) {
      const rate = (inc - exp) / inc;
      out.push({
        icon: "◎",
        tone: rate >= 0.2 ? "good" : "bad",
        title: `Você guardou ${Math.round(rate * 100)}% do que entrou nos últimos ${recent.length} meses.`,
        text: `Entraram ${brl(inc / recent.length)} e saíram ${brl(exp / recent.length)} por mês, em média, sem contar aplicações, resgates e pagamento de fatura.`,
      });
    }
  }

  if (rec.length) {
    const total = rec.reduce((s, r) => s + r.monthly, 0);
    out.push({
      icon: "↻",
      title: `${brl(total)} por mês em ${rec.length} cobranças recorrentes.`,
      text: `As maiores: ${rec
        .slice(0, 3)
        .map((r) => `${r.label} (${brl(r.monthly)})`)
        .join(", ")}.`,
    });
  }

  if (invest.balance > 0 && invest.profit) {
    out.push({
      icon: "↑",
      tone: invest.profit >= 0 ? "good" : "bad",
      title: `Os investimentos renderam ${brl(invest.profit)} sobre o que foi aplicado.`,
      text: `${Math.round((invest.profit / Math.max(1, invest.balance - invest.profit)) * 1000) / 10}% sobre o valor aplicado, na conta de cada banco.`,
    });
  }

  if (unclassified.count > 0) {
    out.push({
      icon: "?",
      title: `${unclassified.count} movimentações sem categoria (${brl(unclassified.amount)}).`,
      text: "Classificar uma vez a pessoa ou a loja já resolve as próximas.",
    });
  }
  return out;
}
