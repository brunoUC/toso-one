"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ForgetOld() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/feed", { method: "POST" });
          const r = (await res.json().catch(() => ({}))) as { error?: string };
          setBusy(false);
          if (!res.ok) return setError(r.error ?? "Não deu certo.");
          router.refresh();
        }}
      >
        {busy ? "Apagando…" : "Apagar"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
