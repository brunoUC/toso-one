"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Icon } from "./Icon";

export function EnablePasskeyButton({ label = "Ativar Face ID", small = false }: { label?: string; small?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      if (!browserSupportsWebAuthn()) throw new Error("Este navegador não suporta passkeys.");
      const res = await fetch("/api/auth/passkey/cadastrar/opcoes", { method: "POST" });
      const options = await res.json();
      if (!res.ok) throw new Error(options.error ?? "Não foi possível começar.");
      const response = await startRegistration({ optionsJSON: options });
      const done = await fetch("/api/auth/passkey/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const data = await done.json();
      if (!done.ok) throw new Error(data.error ?? "Não foi possível cadastrar.");
      setMessage({ ok: true, text: `Face ID ativo neste ${data.deviceName}.` });
      router.refresh();
    } catch (err) {
      const e = err as Error;
      const text =
        e.name === "InvalidStateError"
          ? "Este aparelho já está cadastrado."
          : e.name === "NotAllowedError"
            ? "Cadastro cancelado."
            : e.message;
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={`btn btn-primary${small ? " btn-sm" : ""}`} type="button" onClick={enable} disabled={busy}>
        <Icon name="face" size={16} />
        {busy ? "Aguardando…" : label}
      </button>
      {message && (
        <span role="status" style={{ fontSize: 13, color: message.ok ? "var(--up)" : "var(--down)" }}>
          {message.text}
        </span>
      )}
    </>
  );
}
