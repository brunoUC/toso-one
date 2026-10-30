import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";
import type { WeekNumbers, WeekReport } from "@/lib/financas";

// Porta da análise semanal da XP. Quem chama é a tarefa agendada do Claude
// Code (sábado de manhã), com o token TOSO_AGENT_TOKEN, não o navegador:
//   GET  → os números da semana (calculados aqui e no Convex, com o CDI)
//   POST → { report, sources } com a análise; os números são recalculados
//          aqui, nunca vêm de quem chamou.
// O token só abre esta rota: nada de extrato, contas ou edição.

function authorized(request: Request): boolean {
  const expected = process.env.TOSO_AGENT_TOKEN ?? "";
  if (expected.length < 32) return false;
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

// CDI acumulado no período, pela série 12 do Banco Central (% ao dia).
async function cdiBetween(from: string, to: string): Promise<number | null> {
  if (from > to) return null;
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dmy(from)}&dataFinal=${dmy(to)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) return null;
    const rows = (await res.json()) as { data: string; valor: string }[];
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.reduce((acc, r) => acc * (1 + Number(r.valor) / 100), 1) - 1;
  } catch {
    return null;
  }
}

async function weekNumbers(): Promise<WeekNumbers> {
  const n = (await convex().query(api.financas.weekly.numbers, { secret: serverSecret() })) as WeekNumbers;
  if (n.hasBase) {
    n.cdiPct = await cdiBetween(shift(n.weekStart, 1), n.weekEnd);
    n.pctOfCdi = n.cdiPct && n.gainPct !== null ? n.gainPct / n.cdiPct : null;
  }
  return n;
}

function guard(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  return null;
}

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ numbers: await weekNumbers() });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.split("\n")[0] }, { status: 502 });
  }
}

// ── Validação do que a sessão manda ──────────────────────────────────────────

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.map((x) => text(x, maxLen)).filter((x): x is string => Boolean(x)).slice(0, maxItems) : [];

function parseReport(v: unknown): WeekReport | string {
  if (!v || typeof v !== "object") return "report ausente";
  const r = v as Record<string, unknown>;
  const headline = text(r.headline, 200);
  const summary = text(r.summary, 1200);
  const action = text(r.action, 400);
  if (!headline || !summary || !action) return "headline, summary e action são obrigatórios";
  const opportunities = (Array.isArray(r.opportunities) ? r.opportunities : []).slice(0, 3).map((o) => {
    const x = (o ?? {}) as Record<string, unknown>;
    return {
      title: text(x.title, 120) ?? "",
      product: text(x.product, 200) ?? "",
      liquidity: text(x.liquidity, 40) ?? "",
      rate: text(x.rate, 120) ?? "",
      minimum: text(x.minimum, 60) ?? "",
      tax: text(x.tax, 160) ?? "",
      why: text(x.why, 600) ?? "",
      how: text(x.how, 300) ?? "",
    };
  });
  if (opportunities.some((o) => !o.title || !o.product)) return "cada oportunidade precisa de title e product";
  return {
    headline,
    summary,
    market: list(r.market, 4, 300),
    portfolio: list(r.portfolio, 4, 300),
    opportunities,
    action,
    risks: list(r.risks, 3, 300),
  };
}

function parseSources(v: unknown): { title: string; url: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { title: string; url: string }[] = [];
  for (const s of v.slice(0, 20)) {
    const x = (s ?? {}) as Record<string, unknown>;
    const url = text(x.url, 500);
    if (!url || !/^https:\/\//i.test(url)) continue;
    out.push({ title: text(x.title, 200) ?? url, url });
  }
  return out;
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { report?: unknown; sources?: unknown } | null;
  const report = parseReport(body?.report);
  if (typeof report === "string") return NextResponse.json({ error: report }, { status: 400 });
  try {
    const numbers = await weekNumbers();
    await convex().mutation(api.financas.weekly.save, {
      secret: serverSecret(),
      weekEnd: numbers.weekEnd,
      numbers: JSON.stringify(numbers),
      report: JSON.stringify(report),
      sources: JSON.stringify(parseSources(body?.sources)),
      push: `${report.headline} ${report.action}`,
    });
    return NextResponse.json({ ok: true, weekEnd: numbers.weekEnd });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.split("\n")[0] }, { status: 502 });
  }
}
