import { internalActionGeneric as internalAction } from "convex/server";
import { v } from "convex/values";

// Integração com a Pluggy (Open Finance). As chaves ficam só nas variáveis de
// ambiente do Convex (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET): nunca passam
// pelo Next nem pelo navegador.

const API = "https://api.pluggy.ai";

async function apiKey(): Promise<string> {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Convex.");
  const res = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new Error(`Pluggy recusou as chaves (${res.status}).`);
  return ((await res.json()) as { apiKey: string }).apiKey;
}

async function get<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "X-API-KEY": key } });
  if (!res.ok) throw new Error(`GET ${path.split("?")[0]} → ${res.status}`);
  return (await res.json()) as T;
}

type Page<T> = { results: T[]; total?: number; totalPages?: number };
type Item = { id: string; status: string; executionStatus?: string; lastUpdatedAt?: string; connector?: { id: number; name: string; isOpenFinance?: boolean }; consentExpiresAt?: string };
type Account = { id: string; type: string; subtype?: string; name?: string; currencyCode?: string };
type Tx = {
  description?: string;
  descriptionRaw?: string;
  type?: string;
  status?: string;
  operationType?: string;
  category?: string;
  merchant?: unknown;
  paymentData?: { paymentMethod?: string; payer?: unknown; receiver?: unknown } | null;
  creditCardMetadata?: { payeeMCC?: number | string; totalInstallments?: number; purchaseDate?: string } | null;
};
type Investment = { type?: string; subtype?: string };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

// Diagnóstico dos dados reais, SEM devolver valores, nomes ou descrições:
// só contagens e quanto de cada campo veio preenchido. Serve para decidir o
// que dá para construir antes de construir.
export const probe = internalAction({
  args: { itemIds: v.array(v.string()) },
  handler: async (_ctx, { itemIds }) => {
    const key = await apiKey();
    const out = [];
    for (const itemId of itemIds) {
      try {
        const item = await get<Item>(key, `/items/${itemId}`);
        const accounts = (await get<Page<Account>>(key, `/accounts?itemId=${itemId}`)).results;
        const accSummary = [];
        for (const acc of accounts) {
          const page = await get<Page<Tx>>(key, `/transactions?accountId=${acc.id}&pageSize=500`);
          const txs = page.results;
          const has = (f: (t: Tx) => unknown) => txs.filter((t) => Boolean(f(t))).length;
          const methods: Record<string, number> = {};
          for (const t of txs) {
            const m = t.paymentData?.paymentMethod;
            if (m) methods[m] = (methods[m] ?? 0) + 1;
          }
          accSummary.push({
            type: acc.type,
            subtype: acc.subtype ?? null,
            transactionsInFirstPage: txs.length,
            totalTransactions: page.total ?? null,
            withDescription: pct(has((t) => t.description), txs.length),
            withPaymentData: pct(has((t) => t.paymentData), txs.length),
            withPayerOrReceiver: pct(has((t) => t.paymentData?.payer || t.paymentData?.receiver), txs.length),
            paymentMethods: methods,
            withCreditCardMetadata: pct(has((t) => t.creditCardMetadata), txs.length),
            withMCC: pct(has((t) => t.creditCardMetadata?.payeeMCC), txs.length),
            withInstallments: pct(has((t) => (t.creditCardMetadata?.totalInstallments ?? 0) > 1), txs.length),
            withPluggyCategory: pct(has((t) => t.category), txs.length),
            withMerchant: pct(has((t) => t.merchant), txs.length),
            statuses: [...new Set(txs.map((t) => t.status))],
          });
        }
        let investments: Record<string, number> | string = {};
        try {
          const inv = (await get<Page<Investment>>(key, `/investments?itemId=${itemId}`)).results;
          for (const i of inv) {
            const k = `${i.type ?? "?"}${i.subtype ? "/" + i.subtype : ""}`;
            investments[k] = (investments[k] ?? 0) + 1;
          }
        } catch (err) {
          investments = (err as Error).message;
        }
        out.push({
          itemId,
          connector: item.connector?.name ?? null,
          openFinance: item.connector?.isOpenFinance ?? null,
          status: item.status,
          executionStatus: item.executionStatus ?? null,
          lastUpdatedAt: item.lastUpdatedAt ?? null,
          consentExpiresAt: item.consentExpiresAt ?? null,
          accounts: accSummary,
          investments,
        });
      } catch (err) {
        out.push({ itemId, error: (err as Error).message });
      }
    }
    return out;
  },
});
