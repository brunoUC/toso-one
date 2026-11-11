"use client";

import { useEffect, useState } from "react";

// Link que abre no Safari de verdade. No toso one instalado na Tela de
// Início, um link para outro site abre numa janela interna, onde as
// extensões do Safari (o Userscripts, que limpa o Instagram) não rodam.
// O iOS 17+ entende "x-safari-https://…" como "abra isto no Safari". Vale
// para qualquer iPhone/iPad (no próprio Safari só abre outra aba), para não
// depender de detectar o app instalado.
export function SafariLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const [safari, setSafari] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!ios) return;
    const abs = new URL(href, location.origin).toString();
    if (abs.startsWith("https://")) setSafari(abs.replace(/^https:\/\//, "x-safari-https://"));
  }, [href]);

  // O esquema x-safari abre na mesma janela (o iOS passa para o Safari);
  // com target="_blank" o app instalado abriria a janela interna.
  return safari ? (
    <a className={className} href={safari}>
      {children}
    </a>
  ) : (
    <a className={className} href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
