import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { FinanceDashboard } from "./FinanceDashboard";

export const metadata: Metadata = { title: "Finanças" };

export default async function FinancasPage() {
  await requireSession("/financas");
  return (
    <main className="page">
      <FinanceDashboard />
    </main>
  );
}
