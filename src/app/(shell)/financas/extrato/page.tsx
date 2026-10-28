import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { CATEGORIES, GROUPS, categoryOf } from "@/lib/fin-taxonomy";
import { brlCents, dayLabel, getTxList, lastDay, METHOD_LABEL, monthName, shiftMonth, type LeanTx } from "@/lib/financas";
import { FinNav } from "../FinNav";

export const metadata: Metadata = { title: "Extrato · Finanças" };

type Search = { mes?: string; conta?: string; tipo?: string; cat?: string; q?: string; dir?: string };

const thisMonth = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession("/financas/extrato");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : thisMonth();
  const { rows, accounts, custom } = await getTxList(`${month}-01`, lastDay(month));

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = rows.filter((t) => {
    if (sp.conta && t.accountId !== sp.conta) return false;
    if (sp.tipo && t.method !== sp.tipo) return false;
    if (sp.dir === "saida" && t.amount >= 0) return false;
    if (sp.dir === "entrada" && t.amount < 0) return false;
    if (sp.cat) {
      const cat = categoryOf(t.category, custom);
      if (sp.cat.startsWith("grupo:") ? cat.group !== sp.cat.slice(6) : t.category !== sp.cat) return false;
    }
    if (q && ![t.description, t.merchantName, t.counterpartName, t.note].some((s) => s?.toLowerCase().includes(q))) return false;
    return true;
  });

  const accName = new Map(accounts.map((a) => [a.accountId, `${a.bank} · ${a.type === "CREDIT" ? "cartão" : "conta"}`]));
  const days = new Map<string, LeanTx[]>();
  for (const t of filtered) days.set(t.date, [...(days.get(t.date) ?? []), t]);

  let spend = 0;
  let income = 0;
  const byCat = new Map<string, number>();
  for (const t of filtered) {
    const cat = categoryOf(t.category, custom);
    if (cat.kind === "expense") {
      spend -= t.amount;
      byCat.set(cat.slug, (byCat.get(cat.slug) ?? 0) - t.amount);
    } else if (cat.kind === "income") income += t.amount;
  }
  const topCats = [...byCat.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const link = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, mes: month, ...patch };
    for (const [k, val] of Object.entries(merged)) if (val) p.set(k, val);
    return `/financas/extrato?${p}`;
  };
  const allCats = [...CATEGORIES, ...custom];

  return (
    <main className="page">
      <div className="fin-top">
        <FinNav active="/financas/extrato" />
      </div>

      <div className="fin-head">
        <div>
          <p className="hero-label">Extrato de todos os bancos</p>
          <h1 className="fin-month">
            <Link href={link({ mes: shiftMonth(month, -1) })} aria-label="Mês anterior">‹</Link>
            {monthName(month)}
            {month < thisMonth() && <Link href={link({ mes: shiftMonth(month, 1) })} aria-label="Próximo mês">›</Link>}
          </h1>
          <div className="hero-delta">
            <span>{filtered.length} movimentações</span>
            <span className="down">Gastos {brlCents(spend)}</span>
            <span className="up">Receitas {brlCents(income)}</span>
          </div>
        </div>
      </div>

      <form className="card fin-filters" action="/financas/extrato">
        <input type="hidden" name="mes" value={month} />
        <input className="ed-input" name="q" placeholder="Buscar loja, pessoa ou descrição" defaultValue={sp.q ?? ""} />
        <select className="ed-input" name="conta" defaultValue={sp.conta ?? ""}>
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.bank} · {a.type === "CREDIT" ? "cartão" : "conta"} · {a.name}
            </option>
          ))}
        </select>
        <select className="ed-input" name="tipo" defaultValue={sp.tipo ?? ""}>
          <option value="">Todos os tipos</option>
          {Object.entries(METHOD_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select className="ed-input" name="cat" defaultValue={sp.cat ?? ""}>
          <option value="">Todas as categorias</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              <option value={`grupo:${g}`}>{g} (todas)</option>
              {allCats
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select className="ed-input" name="dir" defaultValue={sp.dir ?? ""}>
          <option value="">Entradas e saídas</option>
          <option value="saida">Só saídas</option>
          <option value="entrada">Só entradas</option>
        </select>
        <button className="btn btn-primary btn-sm" type="submit">
          Filtrar
        </button>
        {(sp.q || sp.conta || sp.tipo || sp.cat || sp.dir) && (
          <Link className="link-btn" href={`/financas/extrato?mes=${month}`}>
            Limpar
          </Link>
        )}
      </form>

      {topCats.length > 0 && (
        <div className="fin-chips">
          {topCats.map(([slug, v]) => (
            <Link key={slug} className="chip" href={link({ cat: slug })}>
              {categoryOf(slug, custom).name} <b>{brlCents(v)}</b>
            </Link>
          ))}
          <Link className="chip warn" href={link({ cat: "a-classificar" })}>
            A classificar
          </Link>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <p className="card-sub" style={{ margin: 0 }}>
            {rows.length ? "Nada com esses filtros." : "Nenhuma movimentação neste mês ainda."}
          </p>
        </div>
      ) : (
        <div className="tx-days">
          {[...days.entries()].map(([day, list]) => {
            const net = list.reduce((s, t) => s + t.amount, 0);
            return (
              <section key={day} className="card tx-day">
                <header>
                  <h3>{dayLabel(day)}</h3>
                  <span className={net < 0 ? "down" : "up"}>{brlCents(net)}</span>
                </header>
                <ul>
                  {list.map((t) => {
                    const cat = categoryOf(t.category, custom);
                    return (
                      <li key={t.txId}>
                        <Link href={`/financas/m/${encodeURIComponent(t.txId)}`} className="tx-row">
                          <span className={`tx-method m-${t.method.toLowerCase()}`}>{METHOD_LABEL[t.method] ?? t.method}</span>
                          <span className="tx-main">
                            <b>{t.merchantName ?? t.counterpartName ?? t.description}</b>
                            <small>
                              {(t.merchantName || t.counterpartName) && t.description !== (t.merchantName ?? t.counterpartName) ? `${t.description} · ` : ""}
                              {accName.get(t.accountId)}
                              {t.installments && t.installments > 1 ? ` · parcela ${t.installment}/${t.installments}` : ""}
                              {t.status === "PENDING" ? " · pendente" : ""}
                            </small>
                          </span>
                          <span className={`tx-cat${t.category === "a-classificar" ? " warn" : ""}${cat.kind === "internal" || cat.kind === "business" ? " muted" : ""}`}>{cat.name}</span>
                          <span className={`tx-amt ${t.amount < 0 ? "" : "up"}`}>{brlCents(t.amount)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
