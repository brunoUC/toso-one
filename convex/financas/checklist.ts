// Contas do mês que precisam estar pagas. Cada item reconhece o pagamento
// pela categoria ou, quando a categoria não basta (a creche do Kobe é um
// PIX para uma pessoa), pelo nome de quem recebeu. Dá para trocar o nome
// na tela ("não é este?"); a troca fica em finChecklist.

import { CATEGORY, descriptionKey, norm } from "./taxonomy";
import type { LeanTx } from "./analytics";

export type ChecklistDef = { key: string; name: string; categories: string[]; payee?: string };

export const CHECKLIST: ChecklistDef[] = [
  { key: "condominio", name: "Condomínio", categories: ["condominio", "aluguel"] },
  { key: "luz", name: "Luz", categories: ["energia"] },
  { key: "gas", name: "Gás", categories: ["gas"] },
  { key: "internet", name: "Internet", categories: ["internet-tv", "celular"] },
  { key: "creche", name: "Creche do Kobe", categories: ["pet"], payee: "DOGS CLUB" },
];

export type ChecklistItem = {
  key: string;
  name: string;
  payee: string | null;
  paid: { txId: string; date: string; amount: number; who: string }[];
  typicalDay: number | null;
  lastAmount: number | null;
  candidates: { txId: string; date: string; amount: number; who: string }[];
};

export const whoOf = (t: LeanTx) => t.counterpartName ?? t.merchantName ?? t.description;
const keyOf = (t: LeanTx) => norm(t.counterpartName) || norm(t.merchantName) || descriptionKey(t.description);

export function checklist(txs: LeanTx[], overrides: Map<string, string | null>, today: string): ChecklistItem[] {
  const month = today.slice(0, 7);
  const out = txs.filter((t) => t.amount < 0);
  const thisMonth = out.filter((t) => t.date.slice(0, 7) === month);
  return CHECKLIST.map((def) => {
    const payee = overrides.has(def.key) ? overrides.get(def.key)! : (def.payee ?? null);
    const match = (t: LeanTx) => (payee ? keyOf(t).includes(norm(payee)) : def.categories.includes(t.category));
    const hits = out.filter(match);
    const paid = thisMonth.filter(match);
    // Dia em que costuma ser pago: mediana do primeiro pagamento de cada mês anterior.
    const firstByMonth = new Map<string, LeanTx>();
    for (const t of hits) {
      const m = t.date.slice(0, 7);
      if (m === month) continue;
      const cur = firstByMonth.get(m);
      if (!cur || t.date < cur.date) firstByMonth.set(m, t);
    }
    const days = [...firstByMonth.values()].map((t) => Number(t.date.slice(8, 10))).sort((a, b) => a - b);
    const last = [...firstByMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))[0]?.[1];
    const lastMonthTotal = last ? hits.filter((t) => t.date.slice(0, 7) === last.date.slice(0, 7)).reduce((s, t) => s - t.amount, 0) : null;
    return {
      key: def.key,
      name: def.name,
      payee,
      // O maior pagamento primeiro (é ele que aparece no cartão).
      paid: [...paid].sort((a, b) => a.amount - b.amount).map((t) => ({ txId: t.txId, date: t.date, amount: -t.amount, who: whoOf(t) })),
      typicalDay: days.length ? days[Math.floor(days.length / 2)] : null,
      lastAmount: lastMonthTotal,
      // Para "não é este?": as saídas do mês, das maiores para as menores.
      candidates: thisMonth
        .filter((t) => (CATEGORY.get(t.category)?.kind ?? "expense") === "expense")
        // Contas costumam ser PIX/boleto: esses primeiro, depois o cartão.
        .sort((a, b) => Number(a.method === "CARTAO") - Number(b.method === "CARTAO") || a.amount - b.amount)
        .slice(0, 30)
        .map((t) => ({ txId: t.txId, date: t.date, amount: -t.amount, who: whoOf(t) })),
    };
  });
}
