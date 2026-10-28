import "server-only";
import { api, convex, convexConfigured, serverSecret } from "./convex";
import type { Insight, LeanTx, MonthAgg, Recurring, Snapshot } from "../../convex/financas/analytics";
import type { Custom, Rule } from "../../convex/financas/taxonomy";

// Leitura das Finanças no Convex, sempre do servidor com o segredo.

export type { Insight, LeanTx, MonthAgg, Recurring, Snapshot, Custom };

export type FinItem = {
  itemId: string;
  bank: string;
  status: string;
  executionStatus: string | null;
  bankUpdatedAt: string | null;
  consentExpiresAt: string | null;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  historyFrom: string | null;
};

export type FinAccount = {
  accountId: string;
  bank: string;
  type: string;
  subtype: string | null;
  name: string;
  number: string | null;
  balance: number;
  creditLimit: number | null;
  availableCredit: number | null;
  dueDate: string | null;
};

export type FinInvestment = {
  investmentId: string;
  bank: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: number;
  invested: number | null;
  profit: number | null;
  issuer: string | null;
  rate: number | null;
  rateType: string | null;
  dueDate: string | null;
  lastTwelveMonthsRate: number | null;
};

export type FinGoal = {
  id: string;
  name: string;
  target: number;
  deadline: string | null;
  source: string;
  scope: string | null;
  manualValue: number | null;
  createdAt: number;
  current: number;
};

export type Overview = {
  today: string;
  items: FinItem[];
  accounts: FinAccount[];
  investments: FinInvestment[];
  netWorth: Snapshot | null;
  series: { date: string; label: string; total: number; estimated: boolean }[];
  months: MonthAgg[];
  recurring: Recurring[];
  unclassified: { count: number; amount: number };
  topExpenses: LeanTx[];
  insights: Insight[];
  custom: Custom[];
  goals: FinGoal[];
  budget: { lineId: string; limit: number }[];
  rulesCount: number;
  txCount: number;
};

export type TxDetail = {
  tx: LeanTx & { counterpartDoc: string | null; at: string; syncedAt: number };
  raw: string | null;
  account: { name: string; bank: string; type: string; number: string | null } | null;
  suggestion: { field: Rule["field"]; value: string } | null;
  rule: { id: string; label: string; category: string; field: string } | null;
  similar: LeanTx[];
  custom: Custom[];
};

export type RuleRow = { id: string; field: string; label: string; category: string; createdAt: number; hits: number };

export async function getOverview(): Promise<Overview | null> {
  if (!convexConfigured()) return null;
  const { monthsJson, ...rest } = await convex().query(api.financas.data.overview, { secret: serverSecret() });
  return { ...rest, months: JSON.parse(monthsJson) } as Overview;
}

export async function getTxList(from: string, to: string): Promise<{
  rows: LeanTx[];
  accounts: { accountId: string; bank: string; type: string; name: string }[];
  custom: Custom[];
}> {
  if (!convexConfigured()) return { rows: [], accounts: [], custom: [] };
  return convex().query(api.financas.data.txList, { secret: serverSecret(), from, to });
}

export async function getTx(txId: string): Promise<TxDetail | null> {
  if (!convexConfigured()) return null;
  return convex().query(api.financas.data.txGet, { secret: serverSecret(), txId });
}

export async function getRules(): Promise<{ rules: RuleRow[]; custom: Custom[] }> {
  if (!convexConfigured()) return { rules: [], custom: [] };
  return convex().query(api.financas.data.rules, { secret: serverSecret() });
}

// ── Formatação ───────────────────────────────────────────────────────────────

export const METHOD_LABEL: Record<string, string> = {
  CARTAO: "Cartão",
  PIX: "PIX",
  TED: "TED/DOC",
  BOLETO: "Boleto",
  TARIFA: "Tarifa",
  SAQUE: "Saque",
  DEBITO: "Débito",
  TRANSF: "Transferência",
  OUTRO: "Outro",
};

export const SOURCE_LABEL: Record<string, string> = {
  user: "escolhida por você",
  rule: "regra sua",
  auto: "nome conhecido",
  mcc: "tipo de estabelecimento",
  pluggy: "categoria do banco",
  ai: "sugerida pelo Claude",
  none: "sem pista",
};

export const INVESTMENT_LABEL: Record<string, string> = {
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundos",
  SECURITY: "Previdência",
  EQUITY: "Ações",
  ETF: "ETFs",
  COE: "COE",
  OTHER: "Outros",
};

export function brlCents(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(d)
    .replace(/\./g, "")
    .replace(" de ", " ");
}

export function monthName(key: string): string {
  const d = new Date(key + "-15T12:00:00Z");
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d).replace(" de ", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function lastDay(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Alertas de conexão: banco com erro, dados velhos ou consentimento perto
// de vencer (o Open Finance pede renovação a cada 12 meses).
export function itemAlerts(items: FinItem[], now = Date.now()): { bank: string; text: string; bad: boolean }[] {
  const out: { bank: string; text: string; bad: boolean }[] = [];
  for (const i of items) {
    if (i.lastSyncError) out.push({ bank: i.bank, text: `a última leitura falhou: ${i.lastSyncError}`, bad: true });
    if (["LOGIN_ERROR", "WAITING_USER_INPUT", "OUTDATED"].includes(i.status)) {
      out.push({ bank: i.bank, text: "a conexão pede atenção. Abra o Meu Pluggy e reconecte este banco.", bad: true });
    }
    if (i.bankUpdatedAt && now - new Date(i.bankUpdatedAt).getTime() > 3 * 86400_000) {
      const days = Math.floor((now - new Date(i.bankUpdatedAt).getTime()) / 86400_000);
      out.push({ bank: i.bank, text: `o banco não manda dados novos há ${days} dias.`, bad: true });
    }
    if (i.consentExpiresAt) {
      const days = Math.floor((new Date(i.consentExpiresAt).getTime() - now) / 86400_000);
      if (days <= 45) out.push({ bank: i.bank, text: days < 0 ? "o consentimento venceu. Renove no Meu Pluggy." : `o consentimento vence em ${days} dias. Renove no Meu Pluggy.`, bad: days < 15 });
    }
  }
  return out;
}
