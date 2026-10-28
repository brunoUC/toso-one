// Cliente mínimo da Pluggy. As chaves ficam só nas variáveis de ambiente do
// Convex (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET): nunca passam pelo Next
// nem pelo navegador. Nada aqui usa senha de banco: a Pluggy lê os dados
// pelo consentimento do Open Finance.

export const API = "https://api.pluggy.ai";

export async function apiKey(): Promise<string> {
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

export async function get<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "X-API-KEY": key } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new Error(`GET ${path.split("?")[0]} → ${res.status}${body.message ? `: ${body.message}` : ""}`);
  }
  return (await res.json()) as T;
}

// /v2/transactions pagina por cursor: o "next" da resposta é colado no fim
// do caminho (GET /v2/transactions{next}).
export async function allTransactions<T>(key: string, accountId: string, dateFrom: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const path: string = next
      ? next.startsWith("http")
        ? next.replace(API, "")
        : `/v2/transactions${next}`
      : `/v2/transactions?accountId=${accountId}&dateFrom=${dateFrom}`;
    const page: { results: T[]; next: string | null } = await get(key, path);
    out.push(...page.results);
    next = page.next;
    if (!next) break;
  }
  return out;
}
