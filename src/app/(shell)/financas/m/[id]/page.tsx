import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { categoryOf } from "@/lib/fin-taxonomy";
import { brlCents, getTx, METHOD_LABEL, SOURCE_LABEL } from "@/lib/financas";
import { FinNav } from "../../FinNav";
import { CategoryEditor } from "./CategoryEditor";

export const metadata: Metadata = { title: "Movimentação · Finanças" };
export const dynamic = "force-dynamic";

const FIELD_LABEL: Record<string, string> = {
  counterpartName: "quem recebeu/enviou",
  counterpartDoc: "CPF/CNPJ",
  merchant: "loja",
  description: "descrição",
};

// Mostra o JSON da Pluggy como lista de campos (a.b.c: valor), sem os vazios.
function flatten(obj: unknown, prefix = ""): [string, string][] {
  if (obj === null || obj === undefined || obj === "") return [];
  if (typeof obj !== "object") return [[prefix, String(obj)]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => flatten(v, `${prefix}[${i}]`));
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession(`/financas/m/${id}`);
  const data = await getTx(decodeURIComponent(id));
  if (!data) notFound();
  const { tx, account, rule, suggestion, similar, custom } = data;
  const cat = categoryOf(tx.category, custom);
  const raw = data.raw ? flatten(JSON.parse(data.raw)) : [];
  const who = tx.merchantName ?? tx.counterpartName ?? tx.description;
  const similarTotal = similar.reduce((s, t) => s + t.amount, 0);

  return (
    <main className="page">
      <div className="fin-top">
        <FinNav active="" />
        <Link className="link-btn" href={`/financas/extrato?mes=${tx.date.slice(0, 7)}`}>
          ← extrato de {tx.date.slice(5, 7)}/{tx.date.slice(0, 4)}
        </Link>
      </div>

      <div className="fin-head">
        <div>
          <p className="hero-label">
            {METHOD_LABEL[tx.method] ?? tx.method} · {account ? `${account.bank} · ${account.name}` : tx.bank}
            {tx.status === "PENDING" && <span className="sample">pendente</span>}
          </p>
          <h1 className="fin-title">{who}</h1>
          <p className={`hero-figure ${tx.amount < 0 ? "" : "up"}`}>{brlCents(tx.amount)}</p>
          <div className="hero-delta">
            <span>{new Date(tx.at).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</span>
            {tx.installments && tx.installments > 1 && (
              <span>
                parcela {tx.installment} de {tx.installments}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card span-6">
          <div className="card-title">
            <h3>Categoria</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              {cat.group} · {SOURCE_LABEL[tx.categorySource] ?? tx.categorySource}
            </span>
          </div>
          {rule && (
            <p className="card-sub">
              Regra: tudo com {FIELD_LABEL[rule.field] ?? rule.field} “{rule.label}” vai para {categoryOf(rule.category, custom).name}.
            </p>
          )}
          <CategoryEditor
            txId={tx.txId}
            category={tx.category}
            custom={custom}
            canApply={Boolean(suggestion)}
            applyLabel={suggestion ? `${FIELD_LABEL[suggestion.field]} “${tx.counterpartName ?? tx.merchantName ?? suggestion.value}”` : ""}
            similarCount={similar.length}
            isUser={tx.categorySource === "user"}
            note={tx.note ?? ""}
          />
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Detalhes</h3>
          </div>
          <dl className="kv">
            <dt>Descrição</dt>
            <dd>{tx.description}</dd>
            {tx.merchantName && (
              <>
                <dt>Loja</dt>
                <dd>{tx.merchantName}</dd>
              </>
            )}
            {tx.counterpartName && (
              <>
                <dt>{tx.amount < 0 ? "Para" : "De"}</dt>
                <dd>
                  {tx.counterpartName}
                  {tx.counterpartDoc ? ` · ${tx.counterpartDoc}` : ""}
                </dd>
              </>
            )}
            {tx.mcc && (
              <>
                <dt>Tipo de estabelecimento</dt>
                <dd>MCC {tx.mcc}</dd>
              </>
            )}
            {tx.pluggyCategory && (
              <>
                <dt>Categoria do banco</dt>
                <dd>{tx.pluggyCategory}</dd>
              </>
            )}
            <dt>Conta</dt>
            <dd>{account ? `${account.bank} · ${account.name}${account.number ? ` · ${account.number}` : ""}` : tx.bank}</dd>
          </dl>
        </div>

        {similar.length > 0 && (
          <div className="card span-12">
            <div className="card-title">
              <h3>Outras com {who}</h3>
              <span className="card-sub" style={{ margin: 0 }}>
                {similar.length} movimentações · {brlCents(similarTotal)}
              </span>
            </div>
            <table className="data-table fin-mini">
              <tbody>
                {similar.map((t) => (
                  <tr key={t.txId}>
                    <td>
                      <Link href={`/financas/m/${encodeURIComponent(t.txId)}`}>
                        {t.date.slice(8, 10)}/{t.date.slice(5, 7)}/{t.date.slice(2, 4)}
                      </Link>
                      <small> · {t.description}</small>
                    </td>
                    <td>{categoryOf(t.category, custom).name}</td>
                    <td>{brlCents(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="card span-12 fin-raw">
          <summary>Tudo o que o banco mandou ({raw.length} campos)</summary>
          <dl className="kv mono">
            {raw.map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </main>
  );
}
