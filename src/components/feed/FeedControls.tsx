"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

// "Atualizar": pede uma leitura agora e recarrega quando ela termina.
export function RefreshButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(running);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function poll(tries: number) {
    timer.current = setTimeout(async () => {
      const st = (await fetch("/api/feed?status=1")
        .then((r) => r.json())
        .catch(() => null)) as { running?: boolean } | null;
      router.refresh();
      if (st?.running && tries < 25) poll(tries + 1);
      else setBusy(false);
    }, 6000);
  }

  useEffect(() => {
    if (running) poll(0);
  }, []);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
        poll(0);
      }}
    >
      <Icon name="refresh" size={14} />
      {busy ? "Lendo…" : "Atualizar"}
    </button>
  );
}

export function DisconnectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="link-btn"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Desconectar o Instagram? O feed guardado aqui é apagado.")) return;
        setBusy(true);
        await fetch("/api/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) });
        router.refresh();
      }}
    >
      {busy ? "desconectando…" : "desconectar"}
    </button>
  );
}
