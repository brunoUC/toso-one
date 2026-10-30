import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { getOverview, getWeekly, itemAlerts } from "@/lib/financas";
import { FinanceDashboard } from "../FinanceDashboard";

export const metadata: Metadata = { title: "Painel · Finanças" };
export const dynamic = "force-dynamic";

export default async function FinancasPage() {
  await requireSession("/financas/painel");
  const [data, weeks] = await Promise.all([getOverview().catch(() => null), getWeekly().catch(() => [])]);
  return (
    <main className="page">
      {data && data.items.length && data.netWorth ? (
        <FinanceDashboard data={data} alerts={itemAlerts(data.items)} weeks={weeks} />
      ) : (
        <div className="card">
          <h3>Finanças</h3>
          <p className="card-sub" style={{ margin: 0 }}>
            Ainda sem dados dos bancos. A primeira leitura roda sozinha às 06:17 e às 18:17; se acabou de conectar, volte em alguns minutos.
          </p>
        </div>
      )}
    </main>
  );
}
