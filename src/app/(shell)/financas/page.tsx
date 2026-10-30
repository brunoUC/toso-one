import { redirect } from "next/navigation";

// Finanças abre no orçamento do mês; o painel fica em /financas/painel.
export default function FinancasPage() {
  redirect("/financas/orcamento");
}
