import { internalActionGeneric as internalAction } from "convex/server";
import { v } from "convex/values";
import { API, apiKey, get } from "./financas/pluggyClient";

// Diagnósticos da Pluggy (só contagens e nomes de campos). A sincronização
// de verdade está em financas/sync.ts.

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

// Estrutura da resposta da v2 (só nomes de campos), para adaptar o código
// sem ler dados pessoais.
export const shape = internalAction({
  args: { itemId: v.string(), dateFrom: v.string() },
  handler: async (_ctx, { itemId, dateFrom }) => {
    const key = await apiKey();
    const accounts = (await get<Page<Account>>(key, `/accounts?itemId=${itemId}`)).results;
    const out: Record<string, unknown> = {};
    for (const acc of accounts.slice(0, 2)) {
      const res = await fetch(`${API}/v2/transactions?accountId=${acc.id}&dateFrom=${dateFrom}`, { headers: { "X-API-KEY": key } });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const first = Array.isArray(body.results) ? (body.results[0] as Record<string, unknown> | undefined) : undefined;
      out[`${acc.type}/${acc.subtype ?? ""}`] = {
        status: res.status,
        topKeys: Object.keys(body),
        scalarTop: Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v !== "object" || v === null).map(([k, v]) => [k, typeof v === "string" ? (v.length > 24 ? "…string" : v) : v])),
        resultCount: Array.isArray(body.results) ? body.results.length : null,
        firstResultKeys: first ? Object.keys(first) : null,
        message: typeof body.message === "string" ? body.message : undefined,
      };
    }
    return out;
  },
});

// Descobre o nome do parâmetro de paginação da v2 (o "next" da resposta).
export const cursorProbe = internalAction({
  args: { itemId: v.string(), dateFrom: v.string() },
  handler: async (_ctx, { itemId, dateFrom }) => {
    const key = await apiKey();
    const accounts = (await get<Page<Account>>(key, `/accounts?itemId=${itemId}`)).results;
    for (const acc of accounts) {
      const first = await get<{ results: unknown[]; next: string | null }>(key, `/v2/transactions?accountId=${acc.id}&dateFrom=${dateFrom}`);
      if (!first.next) continue;
      const tries: Record<string, string | number> = {};
      for (const name of ["after", "next", "pageToken", "nextCursor", "startingAfter"]) {
        const res = await fetch(`${API}/v2/transactions?accountId=${acc.id}&dateFrom=${dateFrom}&${name}=${encodeURIComponent(first.next)}`, { headers: { "X-API-KEY": key } });
        const body = (await res.json().catch(() => ({}))) as { message?: string; results?: unknown[] };
        tries[name] = res.ok ? `ok ${body.results?.length ?? 0}` : `${res.status} ${body.message ?? ""}`;
      }
      return { account: `${acc.type}/${acc.subtype}`, firstPage: first.results.length, nextLooksLike: first.next.startsWith("http") ? "url" : `token(${first.next.length})`, tries };
    }
    return "nenhuma conta com segunda página";
  },
});

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

// Diagnóstico dos dados reais, SEM devolver valores, nomes ou descrições:
// só contagens e quanto de cada campo veio preenchido. Serve para decidir o
// que dá para construir antes de construir.
export const probe = internalAction({
  args: { itemIds: v.array(v.string()), dateFrom: v.string() },
  handler: async (_ctx, { itemIds, dateFrom }) => {
    const key = await apiKey();
    const out = [];
    for (const itemId of itemIds) {
      try {
        const item = await get<Item>(key, `/items/${itemId}`);
        const accounts = (await get<Page<Account>>(key, `/accounts?itemId=${itemId}`)).results;
        const accSummary = [];
        for (const acc of accounts) {
          // v2: paginação por cursor; o "next" da resposta é colado no fim do
          // caminho (GET /v2/transactions{next}). O histórico vem desde dateFrom.
          const txs: Tx[] = [];
          let next: string | null = null;
          for (let guard = 0; guard < 200; guard++) {
            const path: string = next
              ? next.startsWith("http") ? next.replace(API, "") : `/v2/transactions${next}`
              : `/v2/transactions?accountId=${acc.id}&dateFrom=${dateFrom}`;
            const page: { results: (Tx & { date?: string })[]; next: string | null } = await get(key, path);
            txs.push(...page.results);
            next = page.next;
            if (!next) break;
          }
          const dates = (txs as { date?: string }[]).map((t) => t.date ?? "").filter(Boolean).sort();
          const page = { total: txs.length };
          const has = (f: (t: Tx) => unknown) => txs.filter((t) => Boolean(f(t))).length;
          const methods: Record<string, number> = {};
          for (const t of txs) {
            const m = t.paymentData?.paymentMethod;
            if (m) methods[m] = (methods[m] ?? 0) + 1;
          }
          accSummary.push({
            type: acc.type,
            subtype: acc.subtype ?? null,
            transactions: page.total,
            oldest: dates[0]?.slice(0, 10) ?? null,
            newest: dates[dates.length - 1]?.slice(0, 10) ?? null,
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

// Movimentações de cada investimento (só tipos, datas e quantidade; sem
// valores), para saber se dá para separar aporte de rendimento.
export const investmentTxProbe = internalAction({
  args: { itemId: v.string() },
  handler: async (_ctx, { itemId }) => {
    const key = await apiKey();
    const inv = (await get<{ results: { id: string; type?: string; name?: string }[] }>(key, `/investments?itemId=${itemId}`)).results;
    const out = [];
    for (const i of inv) {
      try {
        const res = await get<{ results: Record<string, unknown>[]; total?: number }>(key, `/investments/${i.id}/transactions?pageSize=500`);
        const types: Record<string, number> = {};
        for (const t of res.results) {
          const k = `${t.type ?? "?"}/${t.movementType ?? "?"}`;
          types[k] = (types[k] ?? 0) + 1;
        }
        const dates = res.results.map((t) => String(t.date ?? "").slice(0, 10)).filter(Boolean).sort();
        out.push({ type: i.type, total: res.total ?? res.results.length, types, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, keys: Object.keys(res.results[0] ?? {}) });
      } catch (err) {
        out.push({ type: i.type, error: (err as Error).message });
      }
    }
    return out;
  },
});
