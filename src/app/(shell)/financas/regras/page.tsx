import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { CATEGORIES, GROUPS, categoryOf } from "@/lib/fin-taxonomy";
import { getRules } from "@/lib/financas";
import { FinNav } from "../FinNav";
import { DeleteRule } from "./DeleteRule";

export const metadata: Metadata = { title: "Categorias e regras · Finanças" };
export const dynamic = "force-dynamic";

const FIELD_LABEL: Record<string, string> = {
  counterpartName: "Pessoa ou empresa",
  counterpartDoc: "CPF/CNPJ",
  merchant: "Loja",
  description: "Descrição",
};

export default async function RegrasPage() {
  await requireSession("/financas/regras");
  const { rules, custom } = await getRules();
  const all = [...CATEGORIES, ...custom];

  return (
    <main className="page">
      <div className="fin-top">
        <FinNav active="/financas/regras" />
      </div>
      <div className="grid">
        <div className="card span-6">
          <div className="card-title">
            <h3>Suas regras</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              {rules.length}
            </span>
          </div>
          <p className="card-sub">
            Criadas quando você corrige uma movimentação e marca “sempre que for…”. Valem para o passado e para tudo o que chegar. Apagar uma regra devolve as
            movimentações dela à classificação automática.
          </p>
          {rules.length === 0 ? (
            <p className="card-sub">Nenhuma ainda.</p>
          ) : (
            <table className="data-table fin-mini">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Vai para</th>
                  <th>Usos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.label}
                      <small> · {FIELD_LABEL[r.field] ?? r.field}</small>
                    </td>
                    <td>{categoryOf(r.category, custom).name}</td>
                    <td>{r.hits}</td>
                    <td>
                      <DeleteRule id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card span-6">
          <div className="card-title">
            <h3>Como classifica</h3>
          </div>
          <ol className="fin-steps">
            <li>
              <b>Suas regras</b> e o que você escolheu à mão.
            </li>
            <li>
              <b>Entre suas contas</b>: PIX/TED com seu nome ou CPF dos dois lados.
            </li>
            <li>
              <b>Nomes conhecidos</b>: iFood, Uber, Netflix, Sabesp, DARF e centenas de outras marcas.
            </li>
            <li>
              <b>Tipo de estabelecimento</b> (MCC) que a maquininha do cartão informa.
            </li>
            <li>
              <b>Categoria do banco</b>, quando diz alguma coisa.
            </li>
            <li>
              <b>Claude Haiku</b> para o que sobrar (quando a chave estiver no Convex).
            </li>
          </ol>
        </div>

        <div className="card span-12">
          <div className="card-title">
            <h3>Categorias</h3>
            <span className="card-sub" style={{ margin: 0 }}>
              {all.length} em {GROUPS.length} grupos
            </span>
          </div>
          <div className="fin-cats">
            {GROUPS.map((g) => (
              <section key={g}>
                <h4>{g}</h4>
                <ul>
                  {all
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <li key={c.slug}>
                        {c.name}
                        {"tax" in c && c.tax ? <small> · imposto</small> : null}
                        {c.slug.startsWith("u-") ? <small> · sua</small> : null}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
