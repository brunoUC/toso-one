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

export type Snapshot = { date: string; cash: number; investments: number; cardDebt: number; total: number; invested: number; manual?: number };

export type MonthAgg = {
  key: string; // AAAA-MM
  label: string; // out/26
  partial: boolean;
  income: number;
  expense: number;
  business: number; // gasto da empresa pela conta pessoal, fora dos gastos
  businessByCategory: Record<string, number>; // stemos, reembolso-empresa (positivo = saiu de mim)
  gains?: number; // valorização dos investimentos no mês (preenchida no overview)
  manualGains?: number; // parte disso que veio de ativos fora da Pluggy
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
      { key, label: monthLabel(key), partial: key === today.slice(0, 7), income: 0, expense: 0, business: 0, businessByCategory: {}, byCategory: {}, byGroup: {}, incomeByCategory: {} },
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
    } else if (cat.kind === "business") {
      m.business -= t.amount;
      m.businessByCategory[cat.slug] = (m.businessByCategory[cat.slug] ?? 0) - t.amount;
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

// ── Valorização dos investimentos ───────────────────────────────────────────
// Separa ganho de aporte: em cada dia, cotas que eu tinha × quanto a cota
// subiu. O preço da cota só é conhecido nas datas das compras/resgates e hoje;
// entre elas, interpolação geométrica (rendimento constante no intervalo).
// Juros pagos em dinheiro (cupom do Tesouro) já entram na conta como
// rendimento, então não são somados aqui.

export type InvLite = { investmentId: string; name: string; bank: string; gone: boolean; quantity?: number; unitValue?: number; balance: number; invested?: number; type: string };
export type InvTxLite = { investmentId: string; date: string; type: string; movementType?: string; quantity?: number; value?: number };
export type InvGain = { investmentId: string; name: string; bank: string; gone: boolean; gain: number; since: string | null; how: "cota" | "aplicado" };

const DAY = 86400_000;
const dayMs = (d: string) => Date.parse(d + "T00:00:00Z");
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function investmentGains(invs: InvLite[], txs: InvTxLite[], today: string): { byMonth: Record<string, number>; items: InvGain[] } {
  const byMonth: Record<string, number> = {};
  const items: InvGain[] = [];
  for (const inv of invs) {
    const mine = txs.filter((t) => t.investmentId === inv.investmentId).sort((a, b) => (a.date < b.date ? -1 : 1));
    const pts = new Map<string, number>();
    // Preço só de compra/resgate: nos juros, "value" é o valor do cupom.
    for (const t of mine) if ((t.type === "BUY" || t.type === "SELL") && t.value && t.value > 0) pts.set(t.date, t.value);
    if (!inv.gone && inv.unitValue && inv.unitValue > 0) pts.set(today, inv.unitValue);
    const points = [...pts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

    if (points.length < 2 || !mine.some((t) => t.quantity)) {
      // Sem preço de cota (título com preço fixo): só o total desde a compra.
      if (!inv.gone && inv.invested) items.push({ investmentId: inv.investmentId, name: inv.name, bank: inv.bank, gone: inv.gone, gain: inv.balance - inv.invested, since: null, how: "aplicado" });
      continue;
    }

    const signed = (t: InvTxLite) => {
      const q = Math.abs(t.quantity ?? 0);
      if (t.type === "BUY" || (t.type !== "SELL" && t.movementType === "CREDIT" && t.type !== "INTEREST")) return q;
      if (t.type === "SELL" || (t.movementType === "DEBIT" && t.type !== "INTEREST")) return -q;
      return 0;
    };
    // Cotas no fim de cada dia, de trás para frente a partir de hoje.
    const qNow = inv.gone ? 0 : (inv.quantity ?? 0);
    const after = (d: string) => mine.filter((t) => t.date > d).reduce((s, t) => s + signed(t), 0);
    const price = (ms: number) => {
      if (ms <= dayMs(points[0][0])) return points[0][1];
      for (let i = 1; i < points.length; i++) {
        const [d1, p1] = points[i];
        const t1 = dayMs(d1);
        if (ms <= t1) {
          const [d0, p0] = points[i - 1];
          const t0 = dayMs(d0);
          return p0 * Math.pow(p1 / p0, (ms - t0) / Math.max(1, t1 - t0));
        }
      }
      return points[points.length - 1][1];
    };

    const start = dayMs(points[0][0]);
    const end = dayMs(points[points.length - 1][0]);
    let total = 0;
    let prev = price(start);
    for (let ms = start + DAY; ms <= end; ms += DAY) {
      const p = price(ms);
      const held = Math.max(0, qNow - after(isoDay(ms - DAY)));
      const g = held * (p - prev);
      prev = p;
      if (!g) continue;
      const key = isoDay(ms).slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + g;
      total += g;
    }
    items.push({ investmentId: inv.investmentId, name: inv.name, bank: inv.bank, gone: inv.gone, gain: total, since: points[0][0], how: "cota" });
  }
  return { byMonth, items };
}

// ── Ativos fora da Pluggy ───────────────────────────────────────────────────
// Juros compostos mensais, com o mês em andamento contado pro rata pelos dias.

export type ManualAsset = { name: string; principal: number; start: string; monthlyRate: number };

export function manualValue(a: ManualAsset, date: string): number {
  if (date < a.start) return 0;
  const [y0, m0, d0] = a.start.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  let months = (y - y0) * 12 + (m - m0);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  months += (d - d0) / dim;
  return a.principal * Math.pow(1 + a.monthlyRate, Math.max(0, months));
}

// Rendimento de cada mês: valor no fim do mês (ou hoje) menos no começo.
export function manualGainsByMonth(assets: ManualAsset[], monthKeys: string[], today: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of assets) {
    for (const key of monthKeys) {
      const [y, m] = key.split("-").map(Number);
      const first = `${key}-01`;
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const end = last > today ? today : last;
      const from = first < a.start ? a.start : first;
      if (end < a.start || end < from) continue;
      const g = manualValue(a, end) - (from === a.start ? a.principal : manualValue(a, prevDay(from)));
      if (g) out[key] = (out[key] ?? 0) + g;
    }
  }
  return out;
}

const prevDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") - 86400_000).toISOString().slice(0, 10);
