"use client";

import { useState } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Icon } from "@/components/Icon";

type Props = { next: string; passkeyFirst: boolean; passwordReady: boolean };

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
  return data;
}

export function LoginForm({ next, passkeyFirst, passwordReady }: Props) {
  const [busy, setBusy] = useState<"passkey" | "senha" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(!passkeyFirst);
  const [senha, setSenha] = useState("");

  async function withPasskey() {
    setError(null);
    setBusy("passkey");
    try {
      if (!browserSupportsWebAuthn()) throw new Error("Este navegador não suporta Face ID / passkeys.");
      const options = await postJson("/api/auth/passkey/entrar/opcoes");
      const response = await startAuthentication({ optionsJSON: options });
      const done = await postJson("/api/auth/passkey/entrar", { response, de: next });
      window.location.assign(done.next);
    } catch (err) {
      const e = err as Error;
      // Cancelar a janela do Face ID não é erro de verdade.
      setError(e.name === "NotAllowedError" ? "Face ID cancelado." : e.message);
      setBusy(null);
    }
  }

  async function withPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy("senha");
    try {
      const done = await postJson("/api/auth/senha", { senha, de: next });
      window.location.assign(done.next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      {passkeyFirst && (
        <button className="btn btn-primary" type="button" onClick={withPasskey} disabled={busy !== null}>
          <Icon name="face" size={18} />
          {busy === "passkey" ? "Aguardando Face ID…" : "Entrar com Face ID"}
        </button>
      )}

      {passkeyFirst && !showPassword && (
        <p className="form-note" style={{ textAlign: "center" }}>
          <button type="button" className="link-btn" onClick={() => setShowPassword(true)}>
            Usar senha neste aparelho
          </button>
        </p>
      )}

      {showPassword && (
        <form onSubmit={withPassword}>
          {passkeyFirst && <div className="divider">ou</div>}
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoFocus={!passkeyFirst}
              disabled={!passwordReady}
            />
          </div>
          <button
            className={passkeyFirst ? "btn btn-ghost" : "btn btn-primary"}
            type="submit"
            disabled={busy !== null || !passwordReady}
          >
            {busy === "senha" ? "Entrando…" : "Entrar com senha"}
          </button>
          {!passkeyFirst && (
            <p className="form-note">Depois de entrar, ative o Face ID neste aparelho: nas próximas vezes é um toque.</p>
          )}
          {!passwordReady && <p className="form-error">Senha não configurada no servidor (TOSO_PASSWORD).</p>}
        </form>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <p className="login-foot">
        <span className="lock">
          <Icon name="lock" size={12} />
        </span>
        Acesso pessoal · sessão de 90 dias por aparelho
      </p>
    </>
  );
}
