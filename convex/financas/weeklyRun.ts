"use node";

import Anthropic from "@anthropic-ai/sdk";
import { internalActionGeneric as internalAction, makeFunctionReference } from "convex/server";
import type { WeekNumbers, WeekReport } from "./weekly";

// A análise semanal da XP (sábado de manhã, convex/crons.ts, ou "Analisar
// agora"). Duas chamadas ao Claude:
//  1. pesquisa: com busca e leitura na web, olha o cenário da semana (Selic,
//     Copom, CDI, taxas na XP) contra a carteira e procura oportunidades que
//     caibam no perfil (conservador, só liquidez D+0/D+1, tudo pela XP);
//  2. fechamento: transforma a pesquisa no JSON que o painel mostra.
// Só vai para a API o que está nos números abaixo: nomes e saldos dos
// investimentos e das contas. Nenhum CPF, número de conta ou movimentação.
// Roda em Node porque a pesquisa pode levar alguns minutos.

const MODEL = "claude-opus-5-5";
const RESEARCH_DEADLINE_MS = 7 * 60_000; // a action do Convex morre em 10 min
const MAX_CONTINUATIONS = 6;

const ref = {
  context: makeFunctionReference<"query">("financas/weekly:context"),
  start: makeFunctionReference<"mutation">("financas/weekly:start"),
  finish: makeFunctionReference<"mutation">("financas/weekly:finish"),
  push: makeFunctionReference<"action">("push:send"),
};

const PROFILE = `Perfil do investidor:
- Conservador. Prioridade: não perder dinheiro e ter o dinheiro disponível.
- Só aceita liquidez D+0 ou D+1 (resgate cai na conta no mesmo dia ou no dia útil seguinte). Nada com carência, prazo travado, vencimento longo sem liquidez diária, cotização longa, ações, cripto, multimercado, COE ou previdência.
- Tudo pela XP Investimentos (plataforma da XP). Só sugira o que está disponível para pessoa física na XP.
- Mora no Brasil, paga IR de pessoa física (tabela regressiva na renda fixa, IOF nos primeiros 30 dias, come-cotas nos fundos; LCI/LCA isentas).`;

const RESEARCH_SYSTEM = `Você é um analista de renda fixa brasileiro que acompanha a carteira de uma pessoa na XP Investimentos e escreve uma análise semanal curta e honesta.

${PROFILE}

Como trabalhar:
- Pesquise na web o que mudou nesta semana: Selic e próxima reunião do Copom (data e expectativa), CDI, IPCA e Focus, e qualquer notícia que afete renda fixa pós-fixada de liquidez diária.
- Pesquise o que a XP oferece hoje dentro do perfil: fundos DI / renda fixa pós-fixados com resgate D+0 ou D+1 (taxa de administração, rentabilidade em % do CDI nos últimos 12 meses), Tesouro Selic, CDBs com liquidez diária (% do CDI, emissor, FGC), LCI/LCA com liquidez diária (sem carência ou com carência já explícita). Prefira fontes oficiais (xpi.com.br, conteudos.xpi.com.br, tesourodireto.com.br, bcb.gov.br) e cite de onde veio cada taxa.
- Compare com o que ele já tem, sempre em termos líquidos de IR e taxas. Uma oportunidade só entra se for claramente melhor do que deixar como está (ou se houver dinheiro parado rendendo pouco). Se nada for melhor, diga que não há nada a fazer: isso é uma resposta válida.
- No máximo 3 oportunidades. Nunca invente taxa, produto, nome de fundo ou data: se não achou na pesquisa, não sugira.
- Os números da semana (saldos, rendimento, CDI) já vêm calculados; use-os como estão.
Escreva em português do Brasil, direto, sem jargão desnecessário.`;

const FINAL_SYSTEM = `Você recebe a pesquisa semanal de um analista sobre a carteira da XP de um investidor conservador (só liquidez D+0/D+1, tudo pela XP) e os números exatos da semana. Transforme em um resumo para um painel no celular, em português do Brasil.
- headline: uma linha com o resultado da semana em reais e % (e % do CDI, se houver), usando exatamente os números dados.
- summary: 2 a 3 frases.
- market: até 4 itens curtos sobre o cenário (Selic, Copom, CDI, inflação).
- portfolio: até 4 itens curtos sobre a carteira dele (o que rendeu bem ou mal, dinheiro parado, concentração).
- opportunities: só as que a pesquisa sustentou com fonte, no máximo 3; lista vazia se não houver. Em "how", o caminho na XP em uma frase.
- action: o que fazer esta semana em uma frase ("Nada a fazer esta semana." é válido).
- risks: até 3 cuidados (FGC, IR, IOF, come-cotas), só se relevantes.
Não acrescente nada que não esteja na pesquisa ou nos números.`;

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    market: { type: "array", items: { type: "string" } },
    portfolio: { type: "array", items: { type: "string" } },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          product: { type: "string" },
          liquidity: { type: "string" },
          rate: { type: "string" },
          minimum: { type: "string" },
          tax: { type: "string" },
          why: { type: "string" },
          how: { type: "string" },
        },
        required: ["title", "product", "liquidity", "rate", "minimum", "tax", "why", "how"],
        additionalProperties: false,
      },
    },
    action: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "summary", "market", "portfolio", "opportunities", "action", "risks"],
  additionalProperties: false,
} as const;

const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null, digits = 2) => (n === null ? "—" : `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`);
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

// CDI acumulado no período, pela série 12 do Banco Central (% ao dia).
async function cdiBetween(from: string, to: string): Promise<number | null> {
  if (from > to) return null;
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dmy(from)}&dataFinal=${dmy(to)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as { data: string; valor: string }[];
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.reduce((acc, r) => acc * (1 + Number(r.valor) / 100), 1) - 1;
  } catch {
    return null;
  }
}

function describe(n: WeekNumbers): string {
  const lines = [
    `Período: ${dmy(n.weekStart)} a ${dmy(n.weekEnd)}.`,
    n.hasBase
      ? `Investimentos na XP: ${brl(n.start)} → ${brl(n.end)}. Aplicado na semana ${brl(n.inflow)}, resgatado ${brl(n.outflow)}. Rendimento bruto da semana ${brl(n.gain)} (${pct(n.gainPct, 3)}). CDI no período ${pct(n.cdiPct, 3)}${n.pctOfCdi !== null ? `, ou seja ${Math.round(n.pctOfCdi * 100)}% do CDI` : ""}.`
      : `Investimentos na XP hoje: ${brl(n.end)}. Ainda não há o saldo de 7 dias atrás (o histórico diário começou agora), então não dá para dizer quanto rendeu nesta semana.`,
    `Saldo parado na conta da XP: ${brl(n.xpCash)}.`,
    `Contas correntes em outros bancos: ${n.otherCash.map((c) => `${c.bank} ${brl(c.balance)}`).join("; ") || "nenhuma"}. Investimentos fora da XP: ${brl(n.otherInvested)}.`,
    "",
    "Investimentos na XP (nome | tipo | emissor | taxa | vencimento | saldo | aplicado | rendeu no mês / 12 meses | rendeu na semana):",
    ...n.items.map((i) =>
      [
        i.name,
        [i.type, i.subtype].filter(Boolean).join("/"),
        i.issuer ?? "—",
        i.rate !== null ? `${i.rate}${i.rateType ? ` ${i.rateType}` : ""}` : "—",
        i.dueDate ? dmy(i.dueDate) : "—",
        brl(i.balance),
        i.invested !== null ? brl(i.invested) : "—",
        `${i.lastMonthRate !== null ? `${i.lastMonthRate}%` : "—"} / ${i.lastTwelveMonthsRate !== null ? `${i.lastTwelveMonthsRate}%` : "—"}`,
        i.weekGain !== null ? brl(i.weekGain) : "—",
      ].join(" | "),
    ),
  ];
  return lines.join("\n");
}

type Source = { title: string; url: string };

function collect(content: Anthropic.Beta.BetaContentBlock[], texts: string[], sources: Map<string, Source>) {
  for (const b of content) {
    if (b.type === "text") {
      texts.push(b.text);
      for (const c of b.citations ?? []) {
        if ("url" in c && typeof c.url === "string" && !sources.has(c.url)) sources.set(c.url, { title: ("title" in c && c.title) || c.url, url: c.url });
      }
    }
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const numbers = (await ctx.runQuery(ref.context, {})) as WeekNumbers;
    if (numbers.hasBase) {
      numbers.cdiPct = await cdiBetween(shift(numbers.weekStart, 1), numbers.weekEnd);
      numbers.pctOfCdi = numbers.cdiPct && numbers.gainPct !== null ? numbers.gainPct / numbers.cdiPct : null;
    }
    const numbersJson = JSON.stringify(numbers);
    await ctx.runMutation(ref.start, { weekEnd: numbers.weekEnd, numbers: numbersJson });
    if (!process.env.ANTHROPIC_API_KEY) {
      await ctx.runMutation(ref.finish, { weekEnd: numbers.weekEnd, numbers: numbersJson, error: "Falta ANTHROPIC_API_KEY nas variáveis do Convex." });
      return "sem ANTHROPIC_API_KEY";
    }

    try {
      const client = new Anthropic();
      const started = Date.now();
      const facts = describe(numbers);
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        {
          role: "user",
          content: `Hoje é ${dmy(numbers.weekEnd)}. Faça a análise semanal da carteira abaixo e procure oportunidades dentro do perfil.\n\n${facts}`,
        },
      ];
      const texts: string[] = [];
      const sources = new Map<string, Source>();
      // A busca roda no servidor da Anthropic; quando o laço de lá passa do
      // limite, a resposta volta com pause_turn e é só reenviar para continuar.
      for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
        const remaining = RESEARCH_DEADLINE_MS - (Date.now() - started);
        if (remaining < 30_000) break;
        const stream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 32000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: "high" },
            system: RESEARCH_SYSTEM,
            tools: [
              {
                type: "web_search_20260209",
                name: "web_search",
                max_uses: 15,
                user_location: { type: "approximate", country: "BR", city: "São Paulo", timezone: "America/Sao_Paulo" },
              },
              { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
            ],
            messages,
          },
          { timeout: remaining },
        );
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") throw new Error("A pesquisa foi recusada pelo modelo.");
        collect(msg.content, texts, sources);
        if (msg.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: msg.content });
      }
      const research = texts.join("\n").trim();
      if (!research) throw new Error("A pesquisa não voltou com texto.");

      const final = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: { type: "json_schema", schema: REPORT_SCHEMA as unknown as Record<string, unknown> } },
        system: FINAL_SYSTEM,
        messages: [{ role: "user", content: `Números da semana:\n${facts}\n\nPesquisa do analista:\n${research}` }],
      });
      if (final.stop_reason === "refusal" || final.stop_reason === "max_tokens") throw new Error(`O fechamento parou (${final.stop_reason}).`);
      const text = final.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw new Error("O fechamento não voltou com texto.");
      const report = JSON.parse(text.text) as WeekReport;

      await ctx.runMutation(ref.finish, {
        weekEnd: numbers.weekEnd,
        numbers: numbersJson,
        report: JSON.stringify(report),
        sources: JSON.stringify([...sources.values()].slice(0, 15)),
      });
      const body = `${report.headline} ${report.action}`.slice(0, 220);
      await ctx.runAction(ref.push, { title: "Semana na XP", body, url: "/financas/painel", tag: `semana-${numbers.weekEnd}` });
      return report.headline;
    } catch (err) {
      const message = ((err as Error).message || "falhou").slice(0, 300);
      await ctx.runMutation(ref.finish, { weekEnd: numbers.weekEnd, numbers: numbersJson, error: message });
      return message;
    }
  },
});
