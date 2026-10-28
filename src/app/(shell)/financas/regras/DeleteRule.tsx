"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteRule({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="link-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteRule", ruleId: id }) });
        router.refresh();
      }}
    >
      {busy ? "apagando…" : "apagar"}
    </button>
  );
}
