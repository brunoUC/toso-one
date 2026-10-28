"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { BarChart } from "@/components/charts/BarChart";
import { GoalMeter } from "@/components/charts/GoalMeter";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { StatTile } from "@/components/charts/StatTile";
import { Icon } from "@/components/Icon";
import { CATEGORIES, GROUPS, categoryOf } from "@/lib/fin-taxonomy";
import { brl } from "@/lib/format";
import type { FinGoal, MonthAgg, Overview } from "@/lib/financas";
import { FinNav } from "./FinNav";

const INVESTMENT_LABEL: Record<string, string> = {
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundos",
  SECURITY: "Previdência",
  EQUITY: "Ações",
  ETF: "ETFs",
  COE: "COE",
  OTHER: "Outros",
};

const pctTxt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`;

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((k) => k * p >= v) ?? 10;
  return m * p;
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(out.error ?? "Não deu certo.");
  return out;
}

export function FinanceDashboard({ data, alerts }: { data: Overview; alerts: { bank: string; text: string; bad: boolean }[] }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const { months, netWorth, custom } = data;
  const current = months[months.length - 1];
  const closed = months.filter((m) => !m.partial);
  const lastClosed = closed[closed.length - 1];
  const prev3 = closed.slice(-3);
  const avg = (f: (m: MonthAgg) => number, list = prev3) => (list.length ? list.reduce((s, m) => s + f(m), 0) / list.length : 0);

  const avgSpend = avg((m) => m.expense);
  const savings = lastClosed && lastClosed.income > 0 ? (lastClosed.income - lastClosed.expense) / lastClosed.income : null;
  const cards = data.accounts.filter((a) => a.type === "CREDIT");
  const banks = data.accounts.filter((a) => a.type === "BANK");
  const total = netWorth?.total ?? 0;
  const series = data.series.map((p) => ({ label: p.label, netWorth: p.total }));
  const yearAgo = data.series.length >= 13 ? data.series[0] : null;
  const lastSync = Math.max(...data.items.map((i) => i.lastSyncAt ?? 0));

  // Onde está o dinheiro: contas + investimentos por tipo.
  const byType = new Map<string, number>();
  for (const i of data.investments) byType.set(INVESTMENT_LABEL[i.type] ?? i.type, (byType.get(INVESTMENT_LABEL[i.type] ?? i.type) ?? 0) + i.balance);
  const parts = [{ name: "Contas", value: netWorth?.cash ?? 0 }, ...[...byType.entries()].map(([name, value]) => ({ name, value }))].filter((p) => p.value > 0);
  const gross = parts.reduce((s, p) => s + p.value, 0) || 1;
  const slices = parts
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((p, i) => ({ name: p.name, slot: i + 1, pct: Math.round((p.value / gross) * 100), value: p.value }));

  // Gastos por grupo neste mês contra a média dos 3 meses fechados.
  const groups = GROUPS.filter((g) => g !== "Receitas" && g !== "Movimentações internas")
    .map((g) => ({ group: g, now: current.byGroup[g] ?? 0, avg: avg((m) => m.byGroup[g] ?? 0) }))
    .filter((g) => g.now > 0 || g.avg > 0)
    .sort((a, b) => Math.max(b.now, b.avg) - Math.max(a.now, a.avg));
  const groupMax = Math.max(1, ...groups.map((g) => Math.max(g.now, g.avg)));

  const allCats = [...CATEGORIES, ...custom];
  const hasProfit = data.investments.some((i) => i.profit !== null);
  const focus = (group: string) => {
    const cats = allCats.filter((c) => c.group === group);
    const last12 = closed.slice(-12);
    const totals = cats
      .map((c) => ({ slug: c.slug, name: c.name, month: current.byCategory[c.slug] ?? 0, year: last12.reduce((s, m) => s + (m.byCategory[c.slug] ?? 0), 0) }))
      .filter((c) => c.month || c.year)
      .sort((a, b) => b.year - a.year);
    return { totals, month: current.byGroup[group] ?? 0, avg: last12.length ? last12.reduce((s, m) => s + (m.byGroup[group] ?? 0), 0) / last12.length : 0 };
  };
  const taxCats = allCats.filter((c) => "tax" in c && c.tax);
  const last12 = closed.slice(-12);
  const taxes = taxCats
    .map((c) => ({ slug: c.slug, name: c.name, year: last12.reduce((s, m) => s + (m.byCategory[c.slug] ?? 0), 0) }))
    .filter((c) => c.year > 0)
    .sort((a, b) => b.year - a.year);

  async function sync() {
    setSyncing(true);
    try {
      await post({ action: "sync" });
      // A leitura roda em segundo plano no Convex; leva uns 20 s.
      setTimeout(() => {
        router.refresh();
        setSyncing(false);
      }, 25_000);
    } catch {
      setSyncing(false);
    }
  }

  const [whole, cents] = Math.abs(total).toFixed(2).split(".");

  return (
    <>
      <div className="fin-top">
        <FinNav active="/financas" />
        <div className="fin-sync">
          <span>
            {data.items.map((i) => i.bank).join(" · ")} · lido{" "}
            {lastSync ? new Date(lastSync).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "nunca"}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing}>
            <Icon name="refresh" size={14} />
            {syncing ? "Lendo os bancos…" : "Atualizar"}
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <ul className="fin-alerts">
          {alerts.map((a, i) => (
            <li key={i} className={a.bad ? "bad" : undefined}>
              <b>{a.bank}:</b> {a.text}
            </li>
          ))}
        </ul>
      )}

      <div className="fin-head rise">
        <div>
          <p className="hero-label">Patrimônio total</p>
          <p className="hero-figure">
            {total < 0 ? "−" : ""}R$ {Number(whole).toLocaleString("pt-BR")}
            <span className="cents">,{cents}</span>
          </p>
          <div className="hero-delta">
            <span>Contas {brl(netWorth?.cash ?? 0)}</span>
            <span>Investimentos {brl(netWorth?.investments ?? 0)}</span>
            <span className="down">Cartões a pagar {brl(netWorth?.cardDebt ?? 0)}</span>
            {yearAgo && yearAgo.total > 0 && (
              <span className={total >= yearAgo.total ? "up" : "down"}>
                {total >= yearAgo.total ? "↑" : "↓"} {pctTxt(total / yearAgo.total - 1)} em 12 meses
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid">
        {series.length > 1 ? (
          <div className="card span-8 rise">
            <div className="card-title">
              <h3>Evolução do patrimônio</h3>
            </div>
            <p className="card-sub">Fim de cada mês, pela fotografia diária das contas, investimentos e cartões conectados.</p>
            <NetWorthChart data={series} />
          </div>
        ) : (
          <div className="card span-8 rise">
            <div className="card-title">
              <h3>Gastos por mês</h3>
              <span className="card-sub" style={{ margin: 0 }}>
                média {brl(avg((m) => m.expense, closed.slice(-12)))}
              </span>
            </div>
            <p className="card-sub">
              Cartões, PIX, boletos e débitos. Fatura paga, aplicação e transferência entre suas contas ficam de fora. A evolução do patrimônio aparece aqui
              quando houver um mês de fotografias diárias (a primeira foi em {data.series[0]?.label ?? "hoje"}).
            </p>
            <BarChart name="Gastos" max={niceMax(Math.max(...months.map((m) => m.expense)))} data={months.map((m) => ({ label: m.label, value: Math.max(0, m.expense) }))} />
          </div>
        )}

        <div className="card span-4 rise">
          <div className="card-title">
            <h3>Onde está</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              antes dos cartões
            </span>
          </div>
          <AllocationBar slices={slices} total={gross} />
        </div>

        <StatTile
          label={`Gastos em ${current.label} (até hoje)`}
          value={brl(current.expense)}
          delta={avgSpend ? `${current.expense <= avgSpend ? "↓" : "↑"} média 3 meses ${brl(avgSpend)}` : "—"}
          good={current.expense <= avgSpend}
          trend={months.map((m) => m.expense)}
        />
        <StatTile
          label={`Receitas em ${current.label}`}
          value={brl(current.income)}
          delta={`média 3 meses ${brl(avg((m) => m.income))}`}
          good={current.income >= avg((m) => m.income)}
          trend={months.map((m) => m.income)}
        />
        <StatTile
          label={lastClosed ? `Guardou em ${lastClosed.label}` : "Guardou"}
          value={savings === null ? "—" : `${Math.round(savings * 100)}%`}
          delta={lastClosed ? `${brl(lastClosed.income - lastClosed.expense)} do que entrou` : ""}
          good={(savings ?? 0) >= 0.2}
          trend={months.map((m) => (m.income > 0 ? (m.income - m.expense) / m.income : 0))}
        />
        <StatTile
          label="Faturas abertas"
          value={brl(netWorth?.cardDebt ?? 0)}
          delta={
            cards
              .filter((c) => c.dueDate)
              .map((c) => `vence ${c.dueDate!.slice(8, 10)}/${c.dueDate!.slice(5, 7)}`)
              .slice(0, 1)[0] ?? `${cards.length} cartões`
          }
          good
          trend={months.map((m) => m.byGroup["Compras"] ?? 0)}
        />

        <div className="card span-6">
          <div className="card-title">
            <h3>{series.length > 1 ? "Gastos por mês" : "Entradas por mês"}</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              média {brl(avg((m) => (series.length > 1 ? m.expense : m.income), closed.slice(-12)))}
            </span>
          </div>
          <p className="card-sub">
            {series.length > 1
              ? "Cartões, PIX, boletos e débitos. Fatura paga, aplicação e transferência entre suas contas ficam de fora."
              : "Salário, pró-labore, rendimentos e o que mais entrou, sem resgates e transferências entre suas contas."}
          </p>
          {series.length > 1 ? (
            <BarChart name="Gastos" max={niceMax(Math.max(...months.map((m) => m.expense)))} data={months.map((m) => ({ label: m.label, value: Math.max(0, m.expense) }))} />
          ) : (
            <BarChart name="Entradas" max={niceMax(Math.max(...months.map((m) => m.income)))} data={months.map((m) => ({ label: m.label, value: Math.max(0, m.income) }))} />
          )}
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>{current.label}: por grupo</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              traço = média de 3 meses
            </span>
          </div>
          <ul className="fin-bars">
            {groups.map((g) => (
              <li key={g.group}>
                <Link href={`/financas/extrato?mes=${current.key}&cat=${encodeURIComponent(`grupo:${g.group}`)}`}>
                  <span className="nm">{g.group}</span>
                  <span className="bar">
                    <i style={{ width: `${(Math.max(0, g.now) / groupMax) * 100}%` }} />
                    <em style={{ left: `${(g.avg / groupMax) * 100}%` }} />
                  </span>
                  <span className="val">{brl(g.now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {(["Moradia", "Alimentação"] as const).map((g) => {
          const f = focus(g);
          return (
            <div key={g} className="card span-4">
              <div className="card-title">
                <h3>{g === "Moradia" ? "Apartamento" : g}</h3>
                <span className="card-sub" style={{ margin: 0 }}>
                  média {brl(f.avg)}/mês
                </span>
              </div>
              <p className="card-sub">
                {brl(f.month)} em {current.label} até hoje
              </p>
              <table className="data-table fin-mini">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>{current.label}</th>
                    <th>12 meses</th>
                  </tr>
                </thead>
                <tbody>
                  {f.totals.map((c) => (
                    <tr key={c.slug}>
                      <td>
                        <Link href={`/financas/extrato?mes=${current.key}&cat=${c.slug}`}>{c.name}</Link>
                      </td>
                      <td>{brl(c.month)}</td>
                      <td>{brl(c.year)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="card span-4">
          <div className="card-title">
            <h3>Impostos</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              últimos 12 meses
            </span>
          </div>
          <p className="card-sub">{brl(taxes.reduce((s, t) => s + t.year, 0))} no total, inclusive IPTU, IPVA e IOF de compras fora</p>
          <table className="data-table fin-mini">
            <tbody>
              {taxes.map((t) => (
                <tr key={t.slug}>
                  <td>
                    <Link href={`/financas/extrato?mes=${current.key}&cat=${t.slug}`}>{t.name}</Link>
                  </td>
                  <td>{brl(t.year)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Análises</h3>
          </div>
          <p className="card-sub">Calculadas a partir das movimentações</p>
          <ul className="insights">
            {data.insights.map((i, n) => (
              <li key={n}>
                <span className={`ic${i.tone ? " " + i.tone : ""}`}>{i.icon}</span>
                <span>
                  <b>{i.title}</b> {i.text}
                </span>
              </li>
            ))}
            {data.unclassified.count > 0 && (
              <li>
                <span className="ic">→</span>
                <span>
                  <Link href="/financas/extrato?cat=a-classificar">Ver o que falta classificar</Link>
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Cobranças recorrentes</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              {brl(data.recurring.reduce((s, r) => s + r.monthly, 0))}/mês
            </span>
          </div>
          <p className="card-sub">Mesmo valor (±35%) em 3 dos últimos 6 meses ou mais. Parcelas ficam de fora.</p>
          <table className="data-table fin-mini">
            <tbody>
              {data.recurring.slice(0, 12).map((r) => (
                <tr key={r.label}>
                  <td>
                    {r.label}
                    <small> · {categoryOf(r.category, custom).name}</small>
                  </td>
                  <td>{r.months} meses</td>
                  <td>{brl(r.monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Investimentos</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              {brl(netWorth?.investments ?? 0)}
            </span>
          </div>
          <p className="card-sub">Valor bruto de hoje, como o banco informa</p>
          <table className="data-table fin-mini">
            <thead>
              <tr>
                <th>Aplicação</th>
                <th>Hoje</th>
                {hasProfit && <th>Rendeu</th>}
                <th>12 meses</th>
              </tr>
            </thead>
            <tbody>
              {[...data.investments]
                .sort((a, b) => b.balance - a.balance)
                .map((i) => (
                  <tr key={i.investmentId}>
                    <td>
                      {i.name}
                      <small>
                        {" "}
                        · {i.bank} · {INVESTMENT_LABEL[i.type] ?? i.type}
                        {i.dueDate ? ` · vence ${i.dueDate.slice(8, 10)}/${i.dueDate.slice(2, 4)}` : ""}
                      </small>
                    </td>
                    <td>{brl(i.balance)}</td>
                    {hasProfit && <td className={i.profit !== null && i.profit < 0 ? "down" : undefined}>{i.profit !== null ? brl(i.profit) : "—"}</td>}
                    <td>{i.lastTwelveMonthsRate !== null ? `${(i.lastTwelveMonthsRate * (Math.abs(i.lastTwelveMonthsRate) < 1 ? 100 : 1)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Contas e cartões</h3>
          </div>
          <p className="card-sub">Saldo de cada conta e quanto está em aberto em cada cartão</p>
          <table className="data-table fin-mini">
            <tbody>
              {banks
                .filter((a) => a.balance !== 0)
                .map((a) => (
                  <tr key={a.accountId}>
                    <td>
                      {a.bank} <small>· {a.subtype === "SAVINGS_ACCOUNT" ? "poupança" : "conta"} {a.number ?? ""}</small>
                    </td>
                    <td>{brl(a.balance)}</td>
                  </tr>
                ))}
              {cards.map((a) => (
                <tr key={a.accountId}>
                  <td>
                    {a.name}{" "}
                    <small>
                      · {a.bank}
                      {a.creditLimit ? ` · limite ${brl(a.creditLimit)}` : ""}
                      {a.dueDate ? ` · vence ${a.dueDate.slice(8, 10)}/${a.dueDate.slice(5, 7)}` : ""}
                    </small>
                  </td>
                  <td className={a.balance > 0 ? "down" : undefined}>{a.balance > 0 ? `−${brl(a.balance)}` : brl(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Goals goals={data.goals} onChange={() => router.refresh()} />

        <div className="card span-6">
          <div className="card-title">
            <h3>Maiores gastos de {current.label}</h3>
            <Link className="card-sub" style={{ margin: 0 }} href="/financas/extrato">
              extrato completo →
            </Link>
          </div>
          <table className="data-table fin-mini">
            <tbody>
              {data.topExpenses.map((t) => (
                <tr key={t.txId}>
                  <td>
                    <Link href={`/financas/m/${encodeURIComponent(t.txId)}`}>{t.merchantName ?? t.counterpartName ?? t.description}</Link>
                    <small>
                      {" "}
                      · {t.date.slice(8, 10)}/{t.date.slice(5, 7)} · {categoryOf(t.category, custom).name}
                    </small>
                  </td>
                  <td>{brl(-t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const SOURCES = [
  { key: "networth", label: "Patrimônio total" },
  { key: "investments", label: "Só investimentos" },
  { key: "manual", label: "Valor que eu informo" },
  { key: "spend", label: "Teto de gasto no mês" },
];

function Goals({ goals, onChange }: { goals: FinGoal[]; onChange: () => void }) {
  const [form, setForm] = useState<null | { id?: string; name: string; target: string; deadline: string; source: string; manualValue: string; scope: string }>(null);
  const [error, setError] = useState("");
  const now = new Date();

  async function save() {
    if (!form) return;
    setError("");
    try {
      await post({
        action: "saveGoal",
        id: form.id,
        name: form.name,
        target: Number(form.target.replace(/\./g, "").replace(",", ".")),
        deadline: form.deadline || undefined,
        source: form.source,
        manualValue: form.source === "manual" ? Number(form.manualValue.replace(/\./g, "").replace(",", ".")) : undefined,
        scope: form.source === "spend" ? form.scope : undefined,
      });
      setForm(null);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    await post({ action: "deleteGoal", id });
    setForm(null);
    onChange();
  }

  return (
    <div className="card span-6">
      <div className="card-title">
        <h3>Metas</h3>
        <button type="button" className="link-btn" onClick={() => setForm({ name: "", target: "", deadline: "", source: "networth", manualValue: "", scope: "grupo:Alimentação" })}>
          + nova meta
        </button>
      </div>
      <p className="card-sub">Traço = onde deveria estar hoje para chegar no prazo</p>
      {goals.length === 0 && !form && <p className="card-sub">Nenhuma meta ainda.</p>}
      {goals.map((g) => {
        const spend = g.source === "spend";
        let pace: number | null = null;
        let foot = { good: true, text: "", rest: "" };
        if (spend) {
          const day = now.getDate();
          const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          pace = Math.min(1, day / days);
          const over = g.current > g.target * pace;
          foot = { good: !over, text: over ? "acima do ritmo do mês" : "dentro do ritmo", rest: `teto de ${brl(g.target)} no mês` };
        } else if (g.deadline) {
          const start = g.createdAt;
          const end = new Date(g.deadline + "-28T12:00:00Z").getTime();
          pace = Math.max(0, Math.min(1, (Date.now() - start) / Math.max(1, end - start)));
          const ok = g.current / g.target >= pace;
          foot = { good: ok, text: ok ? "no ritmo" : "atrás do ritmo", rest: `prazo ${g.deadline.slice(5, 7)}/${g.deadline.slice(0, 4)}` };
        } else {
          foot = { good: true, text: "", rest: g.current >= g.target ? "concluída" : `faltam ${brl(g.target - g.current)}` };
        }
        return (
          <div key={g.id} className="fin-goal">
            <GoalMeter name={g.name} current={Math.max(0, g.current)} target={g.target} pace={pace} foot={foot} />
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                setForm({
                  id: g.id,
                  name: g.name,
                  target: String(g.target),
                  deadline: g.deadline ?? "",
                  source: g.source,
                  manualValue: g.manualValue !== null ? String(g.manualValue) : "",
                  scope: g.scope ?? "grupo:Alimentação",
                })
              }
            >
              editar
            </button>
          </div>
        );
      })}
      {form && (
        <div className="fin-goal-form">
          <label className="ed-field">
            Nome
            <input className="ed-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Reserva de emergência" />
          </label>
          <label className="ed-field">
            Acompanhar
            <select className="ed-input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {form.source === "spend" && (
            <label className="ed-field">
              Grupo
              <select className="ed-input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                {GROUPS.filter((g) => g !== "Receitas" && g !== "Movimentações internas").map((g) => (
                  <option key={g} value={`grupo:${g}`}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          )}
          {form.source === "manual" && (
            <label className="ed-field">
              Quanto tem hoje (R$)
              <input className="ed-input" inputMode="decimal" value={form.manualValue} onChange={(e) => setForm({ ...form, manualValue: e.target.value })} />
            </label>
          )}
          <label className="ed-field">
            {form.source === "spend" ? "Teto por mês (R$)" : "Alvo (R$)"}
            <input className="ed-input" inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </label>
          {form.source !== "spend" && (
            <label className="ed-field">
              Prazo (opcional)
              <input className="ed-input" type="month" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </label>
          )}
          <div className="ed-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              Salvar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>
              Cancelar
            </button>
            {form.id && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(form.id!)}>
                Apagar
              </button>
            )}
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
