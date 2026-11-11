"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Conectar a conta do Instagram: usuário e senha (com o código de dois
// fatores, se a conta tiver) ou, se o Instagram barrar, o sessionid.

type Result = { ok?: boolean; twoFactor?: boolean; method?: string; error?: string; username?: string };

async function post(body: object): Promise<Result> {
  const res = await fetch("/api/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({ error: "Resposta inválida." }))) as Result;
}

export function ConnectForm({ pendingMethod }: { pendingMethod?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"login" | "code">(pendingMethod ? "code" : "login");
  const [method, setMethod] = useState(pendingMethod ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: object) {
    setBusy(true);
    setError(null);
    const r = await post(body);
    setBusy(false);
    if (r.ok) return router.refresh();
    if (r.twoFactor) {
      setMethod(r.method ?? "");
      setStep("code");
      return;
    }
    setError(r.error ?? "Não deu certo.");
  }

  return (
    <div className="ig-connect">
      {step === "login" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run({ action: "login", username: f.get("username"), password: f.get("password") });
          }}
        >
          <label className="field">
            <span>Usuário do Instagram</span>
            <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Entrando…" : "Conectar"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "code", code: new FormData(e.currentTarget).get("code") });
          }}
        >
          <p className="form-note">Digite o código de {method || "confirmação"}.</p>
          <label className="field">
            <span>Código</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,9}" required autoFocus />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Conferindo…" : "Confirmar"}
          </button>
          <button type="button" className="link-btn" onClick={() => setStep("login")}>
            começar de novo
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
      <p className="form-note">A senha vai direto para o Instagram e não fica guardada: o toso one guarda só a sessão, cifrada.</p>

      <details className="ig-planb">
        <summary>Plano B: o Instagram não deixou entrar</summary>
        <p>
          Às vezes o Instagram barra entradas vindas de servidores. Nesse caso, use a sessão de um navegador onde você já está logado. No Mac, entre no
          instagram.com pelo Chrome, abra <b>Ver → Desenvolvedor → Ferramentas do desenvolvedor → Application → Cookies → instagram.com</b> e copie o valor de{" "}
          <code>sessionid</code>. (No Safari: Desenvolvedor → Mostrar Inspetor Web → Armazenamento → Cookies.)
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "sessionid", sessionid: new FormData(e.currentTarget).get("sessionid") });
          }}
        >
          <label className="field">
            <span>sessionid</span>
            <input name="sessionid" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
          </label>
          <button className="btn btn-ghost btn-sm" disabled={busy}>
            Usar esta sessão
          </button>
        </form>
      </details>
    </div>
  );
}
