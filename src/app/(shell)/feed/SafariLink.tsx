"use client";

import { useEffect, useState } from "react";

// Link que abre no Safari de verdade. No toso one instalado na Tela de
// Início, um link para outro site abre numa janela interna, onde as
// extensões do Safari (o Userscripts, que limpa o Instagram) não rodam.
// O iOS 17+ entende "x-safari-https://…" como "abra isto no Safari".
export function SafariLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const [url, setUrl] = useState(href);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
    if (!ios || !installed) return;
    const abs = new URL(href, location.origin).toString();
    setUrl(abs.replace(/^https:\/\//, "x-safari-https://"));
  }, [href]);

  return (
    <a className={className} href={url} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
