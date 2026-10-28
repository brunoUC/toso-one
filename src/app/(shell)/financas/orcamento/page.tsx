import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { BUDGET, BUDGET_TARGET, LINE_OF } from "@/lib/fin-budget";
import { categoryOf } from "@/lib/fin-taxonomy";
import { brl } from "@/lib/format";
import { getOverview } from "@/lib/financas";
import { FinNav } from "../FinNav";
import { BudgetTable, type BudgetRow } from "./BudgetTable";

export const metadata: Metadata = { title: "Orçamento · Finanças" };
export const dynamic = "force-dynamic";

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

export default async function OrcamentoPage() {
  await requireSession("/financas/orcamento");
  const data = await getOverview().catch(() => null);
  if (!data) {
    return (
      <main className="page">
        <div className="card">
          <p className="card-sub" style={{ margin: 0 }}>
            Ainda sem dados dos bancos.
          </p>
        </div>
      </main>
    );
  }

  const { months, custom } = data;
  const current = months[months.length - 1];
  // Meses fechados com histórico completo: o primeiro mês da série começa no
  // último dia (31/10/2025), então fica de fora.
  const closed = months.filter((m) => !m.partial).slice(1);
  const [y, mo, d] = data.today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const pace = d / daysInMonth;
  const override = new Map(data.budget.map((b) => [b.lineId, b.limit]));

  const rows: BudgetRow[] = BUDGET.map((line) => {
    const sum = (m: (typeof months)[number]) => line.categories.reduce((s, c) => s + (m.byCategory[c] ?? 0), 0);
    const hist = closed.map(sum);
    const spent = sum(current);
    const limit = override.get(line.id) ?? line.limit;
    // Fixos e reservas: o mês fecha no limite (ou no que já passou dele).
    // Variáveis: o ritmo de hoje esticado até o fim do mês.
    const projected = line.kind === "variável" ? (pace > 0.15 ? spent / pace : Math.max(spent, limit)) : Math.max(spent, limit);
    return {
      id: line.id,
      section: line.section,
      name: line.name,
      kind: line.kind,
      note: line.note,
      categories: line.categories.map((c) => categoryOf(c, custom).name),
      limit,
      defaultLimit: line.limit,
      avg: hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0,
      median: median(hist),
      spent,
      projected,
      href: `/financas/extrato?mes=${current.key}&linha=${line.id}`,
    };
  });

  // Gastos que não caem em nenhuma linha (a classificar, categorias novas).
  const loose = new Map<string, { now: number; avg: number }>();
  for (const m of [...closed, current]) {
    for (const [slug, v] of Object.entries(m.byCategory)) {
      if (LINE_OF.has(slug)) continue;
      const e = loose.get(slug) ?? { now: 0, avg: 0 };
      if (m === current) e.now += v;
      else e.avg += v / closed.length;
      loose.set(slug, e);
    }
  }
  const looseRows = [...loose.entries()].filter(([, e]) => Math.abs(e.now) > 1 || Math.abs(e.avg) > 1).sort((a, b) => b[1].avg - a[1].avg);

  const total = rows.reduce((s, r) => s + r.limit, 0);
  const spentNow = rows.reduce((s, r) => s + r.spent, 0);
  const projected = rows.reduce((s, r) => s + r.projected, 0);
  const avgLines = rows.reduce((s, r) => s + r.avg, 0);
  const avgLoose = looseRows.reduce((s, [, e]) => s + e.avg, 0);
  const avgIncome = closed.reduce((s, m) => s + m.income, 0) / Math.max(1, closed.length);
  const stemosYear = closed.reduce((s, m) => s + (m.business ?? 0), 0);
  const inRange = total >= BUDGET_TARGET.min && total <= BUDGET_TARGET.max;

  return (
    <main className="page">
      <div className="fin-top">
        <FinNav active="/financas/orcamento" />
      </div>

      <div className="fin-head rise">
        <div>
          <p className="hero-label">Orçamento pessoal por mês</p>
          <p className="hero-figure">{brl(total)}</p>
          <div className="hero-delta">
            <span className={inRange ? "up" : "down"}>
              meta {brl(BUDGET_TARGET.min)} a {brl(BUDGET_TARGET.max)}
            </span>
            <span>
              gasto real nos últimos {closed.length} meses: {brl(avgLines)}/mês nestas linhas
              {avgLoose > 0 ? ` + ${brl(avgLoose)} ainda sem categoria` : ""}
            </span>
            <span className={avgIncome - total >= 0 ? "up" : "down"}>
              sobra para investir {brl(avgIncome - total)}/mês na média de entradas ({brl(avgIncome)})
            </span>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card tile span-3">
          <div className="label">Gasto em {current.label} até hoje</div>
          <div className="value">{brl(spentNow)}</div>
          <div className={`delta ${spentNow <= total * pace ? "up" : "down"}`}>
            {Math.round((spentNow / total) * 100)}% do orçamento com {Math.round(pace * 100)}% do mês
          </div>
        </div>
        <div className="card tile span-3">
          <div className="label">Projeção para {current.label}</div>
          <div className="value">{brl(projected)}</div>
          <div className={`delta ${projected <= total ? "up" : "down"}`}>
            {projected <= total ? `${brl(total - projected)} abaixo` : `${brl(projected - total)} acima`} do orçamento
          </div>
        </div>
        <div className="card tile span-3">
          <div className="label">Fora do orçamento em {current.label}</div>
          <div className="value">{brl(looseRows.reduce((s, [, e]) => s + e.now, 0))}</div>
          <div className="delta down">
            <Link href={`/financas/extrato?mes=${current.key}&cat=a-classificar`}>a classificar e categorias novas</Link>
          </div>
        </div>
        <div className="card tile span-3">
          <div className="label">stemOS no cartão pessoal</div>
          <div className="value">{brl(current.business ?? 0)}</div>
          <div className="delta">
            {brl(stemosYear)} em {closed.length} meses, fora do orçamento
          </div>
        </div>

        <BudgetTable rows={rows} pace={pace} monthLabel={current.label} />

        <div className="card span-6">
          <div className="card-title">
            <h3>Fora do orçamento</h3>
          </div>
          <p className="card-sub">Categorias sem linha. Classifique “a classificar” e o valor vai para a linha certa.</p>
          <table className="data-table fin-mini">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>{current.label}</th>
                <th>Média</th>
              </tr>
            </thead>
            <tbody>
              {looseRows.map(([slug, e]) => (
                <tr key={slug}>
                  <td>
                    <Link href={`/financas/extrato?mes=${current.key}&cat=${slug}`}>{categoryOf(slug, custom).name}</Link>
                  </td>
                  <td>{brl(e.now)}</td>
                  <td>{brl(e.avg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Como o orçamento foi montado</h3>
          </div>
          <ul className="insights">
            <li>
              <span className="ic">1</span>
              <span>
                <b>Fixos pelo que você informou</b> (condomínio, faxina, energia, internet, tênis, cachorro, seguro do carro), conferidos com o que as contas mostram.
              </span>
            </li>
            <li>
              <span className="ic">2</span>
              <span>
                <b>Variáveis pela média do histórico, com corte</b> onde ele passa do alvo: restaurantes, compras e viagens são onde o dinheiro escapa.
              </span>
            </li>
            <li>
              <span className="ic">3</span>
              <span>
                <b>Sem contar duas vezes:</b> cada gasto entra uma vez, na categoria dele, venha do cartão ou de PIX. A fatura paga não conta.
              </span>
            </li>
            <li>
              <span className="ic">4</span>
              <span>
                <b>stemOS à parte:</b> marque as compras da equipe com a categoria “stemOS e robótica” e elas saem do orçamento pessoal.
              </span>
            </li>
            <li>
              <span className="ic">5</span>
              <span>
                <b>Reservas</b> (viagens, IPVA e manutenção) são para guardar todo mês, mesmo quando não há gasto.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
