"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { THEMES, type Theme } from "@/lib/theme";

export function RemovePasskey({ credentialId, deviceName }: { credentialId: string; deviceName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(`Remover o Face ID do ${deviceName}? Ele vai precisar da senha para entrar de novo.`)) return;
    setBusy(true);
    await fetch("/api/auth/passkey/remover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <button className="btn btn-danger btn-sm" type="button" onClick={remove} disabled={busy}>
      Remover
    </button>
  );
}

const THEME_LABEL: Record<Theme, { name: string; swatch: string }> = {
  claro: { name: "Claro", swatch: "linear-gradient(135deg, #fbfbfc 50%, #eceef1 50%)" },
  grafite: { name: "Grafite", swatch: "linear-gradient(135deg, #282a30 50%, #18191c 50%)" },
};

export function ThemePicker({ initial }: { initial: Theme }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Theme>(initial);
  async function pick(tema: Theme) {
    setCurrent(tema);
    if (tema === "grafite") document.documentElement.dataset.theme = "grafite";
    else delete document.documentElement.dataset.theme;
    await fetch("/api/tema", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema }) });
    router.refresh();
  }
  return (
    <div className="theme-pick" role="group" aria-label="Tema">
      {THEMES.map((t) => (
        <button key={t} type="button" aria-pressed={current === t} onClick={() => pick(t)}>
          <span className="swatch" style={{ background: THEME_LABEL[t].swatch }} />
          {THEME_LABEL[t].name}
        </button>
      ))}
    </div>
  );
}

export function SignOut() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/sair", { method: "POST" });
    window.location.assign("/");
  }
  return (
    <button className="btn btn-ghost btn-sm" type="button" onClick={signOut} disabled={busy}>
      <Icon name="logout" size={15} />
      Sair deste aparelho
    </button>
  );
}
