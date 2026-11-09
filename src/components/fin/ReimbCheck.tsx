"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Caixa "lançado no reembolso" de um gasto da empresa. Marca na hora e
// grava no Convex; se der erro, volta como estava.
export function ReimbCheck({ txId, launchedAt }: { txId: string; launchedAt: number | null }) {
  const router = useRouter();
  const [on, setOn] = useState(Boolean(launchedAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => setOn(Boolean(launchedAt)), [launchedAt]);

  async function toggle(next: boolean) {
    setOn(next);
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/financas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reimb", txId, launched: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setOn(!next);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const when = launchedAt ? new Date(launchedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
  return (
    <label className={`reimb${on ? " on" : ""}${error ? " bad" : ""}`} title={error ? "Não gravou. Tente de novo." : on && when ? `Lançado em ${when}` : "Marque quando lançar no reembolso"}>
      <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
      <span>{on ? "lançado" : "lançar"}</span>
    </label>
  );
}
