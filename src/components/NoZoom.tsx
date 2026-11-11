"use client";

import { useEffect } from "react";

// O Safari do iPhone ignora o "user-scalable=no" para a pinça. Os eventos
// gesture* são só dele: cancelá-los trava o zoom de pinça no app da Tela de
// Início e no navegador. Não muda nada nos outros aparelhos.
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, stop, opts);
    return () => {
      for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.removeEventListener(t, stop);
    };
  }, []);
  return null;
}
