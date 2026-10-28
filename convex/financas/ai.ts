import Anthropic from "@anthropic-ai/sdk";
import { internalActionGeneric as internalAction, internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { CATEGORIES, type Custom } from "./taxonomy";

// Última camada da classificação: o que as regras, os nomes conhecidos, o
// tipo de estabelecimento e a categoria do banco não resolveram vai para o
// Claude Haiku, em lotes. Só roda com ANTHROPIC_API_KEY no Convex. Vai a
// descrição, a loja, o nome de quem recebeu, o valor e o tipo; CPF/CNPJ
// e números de conta não saem daqui.

const MODEL = "claude-haiku-5-5";
const BATCH = 40;
const MAX_PER_RUN = 400;

type Pending = {
  txId: string;
  amount: number;
  accountType: string;
  method: string;
  description: string;
  merchantName?: string;
  counterpartName?: string;
  mcc?: number;
  pluggyCategory?: string;
  installments?: number;
};

const ref = {
  pending: makeFunctionReference<"query">("financas/ai:pending"),
  apply: makeFunctionReference<"mutation">("financas/ai:apply"),
};

export const pending = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("finTx")
      .withIndex("by_category_date", (q) => q.eq("category", "a-classificar"))
      .order("desc")
      .collect();
    const custom = (await ctx.db.query("finCategories").collect()) as unknown as Custom[];
    return {
      custom,
      rows: rows
        .filter((r) => r.categorySource !== "user" && !r.aiTriedAt)
        .slice(0, limit)
        .map(
          (r): Pending => ({
            txId: r.txId as string,
            amount: r.amount as number,
            accountType: r.accountType as string,
            method: r.method as string,
            description: r.description as string,
            merchantName: r.merchantName as string | undefined,
            counterpartName: r.counterpartName as string | undefined,
            mcc: r.mcc as number | undefined,
            pluggyCategory: r.pluggyCategory as string | undefined,
            installments: r.installments as number | undefined,
          }),
        ),
    };
  },
});

export const apply = internalMutation({
  args: { results: v.array(v.object({ txId: v.string(), category: v.union(v.string(), v.null()) })) },
  handler: async (ctx, { results }) => {
    const now = Date.now();
    for (const r of results) {
      const row = await ctx.db.query("finTx").withIndex("by_txId", (q) => q.eq("txId", r.txId)).unique();
      if (!row || row.categorySource === "user" || row.category !== "a-classificar") continue;
      if (r.category) await ctx.db.patch(row._id, { category: r.category, categorySource: "ai", aiTriedAt: now });
      else await ctx.db.patch(row._id, { aiTriedAt: now });
    }
  },
});

export const classifyPending = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.ANTHROPIC_API_KEY) return "sem ANTHROPIC_API_KEY";
    const { rows, custom } = (await ctx.runQuery(ref.pending, { limit: MAX_PER_RUN })) as { rows: Pending[]; custom: Custom[] };
    if (!rows.length) return "nada a classificar";

    const cats = [...CATEGORIES.filter((c) => c.slug !== "a-classificar"), ...custom];
    const allowed = new Set(cats.map((c) => c.slug));
    const catalog = cats.map((c) => `${c.slug}: ${c.group} › ${c.name}`).join("\n");
    const system = `Você classifica movimentações bancárias de uma pessoa física no Brasil.
Escolha para cada movimentação UMA categoria da lista abaixo, pelo slug. Use o nome da loja, a descrição, quem recebeu, o código MCC e a categoria sugerida pelo banco (em inglês, nem sempre certa).
Valor negativo = dinheiro saindo; positivo = entrando. Conta CREDIT é cartão de crédito.
PIX ou TED para o que parece ser uma pessoa física, sem outra pista: pix-pessoas.
Se não der para saber com razoável segurança, responda null. Não invente.

Categorias:
${catalog}`;

    const client = new Anthropic();
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const lines = batch.map((t, n) => ({
        n,
        valor: t.amount,
        conta: t.accountType,
        tipo: t.method,
        descricao: t.description,
        loja: t.merchantName ?? null,
        para_de: t.counterpartName ?? null,
        mcc: t.mcc ?? null,
        banco_sugere: t.pluggyCategory ?? null,
        parcelas: t.installments ?? null,
      }));
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { n: { type: "integer" }, category: { type: ["string", "null"] } },
                    required: ["n", "category"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
        messages: [{ role: "user", content: JSON.stringify(lines) }],
      });
      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") continue;
      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") continue;
      let parsed: { items: { n: number; category: string | null }[] };
      try {
        parsed = JSON.parse(text.text);
      } catch {
        continue;
      }
      const byN = new Map(parsed.items.map((x) => [x.n, x.category]));
      const results = batch.map((t, n) => {
        const c = byN.get(n) ?? null;
        return { txId: t.txId, category: c && allowed.has(c) ? c : null };
      });
      await ctx.runMutation(ref.apply, { results });
      done += results.filter((r) => r.category).length;
    }
    return `${done} de ${rows.length} classificadas`;
  },
});
