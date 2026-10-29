import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { BUDGET, BUDGET_TARGET, LINE_OF } from "@/lib/fin-budget";
import { categoryOf } from "@/lib/fin-taxonomy";
import { brl } from "@/lib/format";
import { getOverview, monthName } from "@/lib/financas";
import { FinNav } from "../FinNav";
import { BudgetTable, type BudgetRow } from "./BudgetTable";

export const metadata: Metadata = { title: "Orçamento · Finanças" };
export const dynamic = "force-dynamic";

type Search = { visao?: string; mes?: string; ano?: string };

export default async function OrcamentoPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession("/financas/orcamento");
  const sp = await searchParams;
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
  const override = new Map(data.budget.map((b) => [b.lineId, b.limit]));
  const usable = months.slice(1); // meses com dado de verdade

  // Período escolhido: um mês (padrão, o atual) ou um ano.
  const annual = sp.visao === "ano";
  const years = [...new Set(usable.map((m) => m.key.slice(0, 4)))];
  const year = annual && years.includes(sp.ano ?? "") ? sp.ano! : String(y);
  const monthKey = !annual && usable.some((m) => m.key === sp.mes) ? sp.mes! : current.key;
  const period = annual ? usable.filter((m) => m.key.startsWith(year)) : usable.filter((m) => m.key === monthKey);
  const isNow = annual ? year === String(y) : monthKey === current.key;
  const dayOfYear = Math.floor((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / 86400_000) + 1;
  const pace = !isNow ? 1 : annual ? dayOfYear / (y % 4 === 0 ? 366 : 365) : d / new Date(Date.UTC(y, mo, 0)).getUTCDate();
  // Ano corrente: limite de 12 meses. Ano anterior: só os meses que têm dado.
  const mult = annual ? (isNow ? 12 : period.length) : 1;
  const label = annual ? (isNow ? `${year} até hoje` : `${year} (${period[0]?.label.split("/")[0]}–${period[period.length - 1]?.label.split("/")[0]})`) : (period[0]?.label ?? current.label);
  const lastKey = period[period.length - 1]?.key ?? current.key;

  const rows: BudgetRow[] = BUDGET.map((line) => {
    const sum = (m: (typeof months)[number]) => line.categories.reduce((s, c) => s + (m.byCategory[c] ?? 0), 0);
    const hist = closed.map(sum);
    const spent = period.reduce((s, m) => s + sum(m), 0);
    const limit = override.get(line.id) ?? line.limit;
    const limitPeriod = limit * mult;
    // Fixos e reservas: o período fecha no limite (ou no que já passou dele).
    // Variáveis: o ritmo de hoje esticado até o fim do período.
    const projected = line.kind === "variável" ? (pace > 0.15 ? spent / pace : Math.max(spent, limitPeriod)) : Math.max(spent, limitPeriod);
    return {
      id: line.id,
      section: line.section,
      name: line.name,
      kind: line.kind,
      note: line.note,
      categories: line.categories.map((c) => categoryOf(c, custom).name),
      limit,
      limitPeriod,
      defaultLimit: line.limit,
      avg: hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0,
      spent,
      projected,
      href: `/financas/extrato?mes=${lastKey}&linha=${line.id}`,
    };
  });

  // Gastos que não caem em nenhuma linha (a classificar, categorias novas).
  const loose = new Map<string, { now: number; avg: number }>();
  for (const m of closed) {
    for (const [slug, v] of Object.entries(m.byCategory)) {
      if (LINE_OF.has(slug)) continue;
      const e = loose.get(slug) ?? { now: 0, avg: 0 };
      e.avg += v / closed.length;
      loose.set(slug, e);
    }
  }
  for (const m of period) {
    for (const [slug, v] of Object.entries(m.byCategory)) {
      if (LINE_OF.has(slug)) continue;
      const e = loose.get(slug) ?? { now: 0, avg: 0 };
      e.now += v;
      loose.set(slug, e);
    }
  }
  const looseRows = [...loose.entries()].filter(([, e]) => Math.abs(e.now) > 1 || Math.abs(e.avg) > 1).sort((a, b) => b[1].avg - a[1].avg);

  const total = rows.reduce((s, r) => s + r.limit, 0);
  const totalPeriod = total * mult;
  const spentNow = rows.reduce((s, r) => s + r.spent, 0);
  const projected = rows.reduce((s, r) => s + r.projected, 0);
  const avgLines = rows.reduce((s, r) => s + r.avg, 0);
  const avgLoose = looseRows.reduce((s, [, e]) => s + e.avg, 0);
  const avgIncome = closed.reduce((s, m) => s + m.income, 0) / Math.max(1, closed.length);
  const stemosPeriod = period.reduce((s, m) => s + (m.business ?? 0), 0);
  const inRange = total >= BUDGET_TARGET.min && total <= BUDGET_TARGET.max;

  // Navegação: mês ou ano anterior/seguinte que tenham dados.
  const keys = usable.map((m) => m.key);
  const i = annual ? years.indexOf(year) : keys.indexOf(monthKey);
  const list = annual ? years : keys;
  const href = (v: string) => (annual ? `/financas/orcamento?visao=ano&ano=${v}` : `/financas/orcamento?mes=${v}`);
  const prev = i > 0 ? href(list[i - 1]) : null;
  const next = i < list.length - 1 ? href(list[i + 1]) : null;
  const unit = annual ? "do ano" : "do mês";

  return (
    <main className="page">
      <div className="fin-top">
        <FinNav active="/financas/orcamento" />
        <div className="bud-period">
          <div className="seg" role="group" aria-label="Visão">
            <Link href={`/financas/orcamento?mes=${monthKey === current.key || annual ? current.key : monthKey}`} aria-current={!annual ? "page" : undefined}>
              Mês
            </Link>
            <Link href={`/financas/orcamento?visao=ano&ano=${annual ? year : monthKey.slice(0, 4)}`} aria-current={annual ? "page" : undefined}>
              Ano
            </Link>
          </div>
          <div className="bud-nav">
            {prev ? (
              <Link href={prev} aria-label="Anterior">
                ‹
              </Link>
            ) : (
              <span aria-hidden="true">‹</span>
            )}
            <b>{annual ? year : monthName(monthKey)}</b>
            {next ? (
              <Link href={next} aria-label="Seguinte">
                ›
              </Link>
            ) : (
              <span aria-hidden="true">›</span>
            )}
          </div>
        </div>
      </div>

      <div className="fin-head rise">
        <div>
          <p className="hero-label">{annual ? `Orçamento pessoal de ${label}` : "Orçamento pessoal por mês"}</p>
          <p className="hero-figure">{brl(totalPeriod)}</p>
          <div className="hero-delta">
            {annual && <span>{brl(total)}/mês</span>}
            <span className={inRange ? "up" : "down"}>
              meta {brl(BUDGET_TARGET.min)} a {brl(BUDGET_TARGET.max)} por mês
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
          <div className="label">
            Gasto em {label}
            {isNow && !annual ? " até hoje" : ""}
          </div>
          <div className="value">{brl(spentNow)}</div>
          <div className={`delta ${spentNow <= totalPeriod * pace ? "up" : "down"}`}>
            {Math.round((spentNow / totalPeriod) * 100)}% do orçamento{isNow ? ` com ${Math.round(pace * 100)}% ${unit}` : ""}
          </div>
        </div>
        <div className="card tile span-3">
          <div className="label">{isNow ? `Projeção para ${annual ? year : label}` : `Fechou ${label}`}</div>
          <div className="value">{brl(projected)}</div>
          <div className={`delta ${projected <= totalPeriod ? "up" : "down"}`}>
            {projected <= totalPeriod ? `${brl(totalPeriod - projected)} abaixo` : `${brl(projected - totalPeriod)} acima`} do orçamento
          </div>
        </div>
        <div className="card tile span-3">
          <div className="label">Fora do orçamento em {label}</div>
          <div className="value">{brl(looseRows.reduce((s, [, e]) => s + e.now, 0))}</div>
          <div className="delta down">
            <Link href={`/financas/extrato?mes=${lastKey}&cat=a-classificar`}>a classificar e categorias novas</Link>
          </div>
        </div>
        <div className="card tile span-3">
          <div className="label">stemOS no cartão pessoal</div>
          <div className="value">{brl(stemosPeriod)}</div>
          <div className="delta">em {label}, fora do orçamento</div>
        </div>

        <BudgetTable rows={rows} pace={isNow ? pace : null} periodLabel={label} annual={annual} />

        <div className="card span-6">
          <div className="card-title">
            <h3>Fora do orçamento</h3>
          </div>
          <p className="card-sub">Categorias sem linha. Classifique “a classificar” e o valor vai para a linha certa.</p>
          <table className="data-table fin-mini">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>{annual ? year : label}</th>
                <th>Média</th>
              </tr>
            </thead>
            <tbody>
              {looseRows.map(([slug, e]) => (
                <tr key={slug}>
                  <td>
                    <Link href={`/financas/extrato?mes=${lastKey}&cat=${slug}`}>{categoryOf(slug, custom).name}</Link>
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
