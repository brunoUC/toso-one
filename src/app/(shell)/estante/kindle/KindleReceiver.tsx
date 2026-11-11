"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Só aceita mensagens da própria Amazon (read.amazon.com, ler.amazon.com.br…).
const AMAZON = /^https:\/\/([a-z0-9-]+\.)*amazon\.[a-z.]+$/;
type Row = { book: string; author?: string; text: string; note?: string; location?: string; page?: string };

export function KindleReceiver() {
  const [status, setStatus] = useState<{ text: string; done?: boolean; bad?: boolean }>({ text: "Esperando a página da Amazon…" });
  const got = useRef(false);

  useEffect(() => {
    if (!window.opener) {
      setStatus({ text: "Esta aba se abre sozinha pelo favorito “Enviar ao toso one”, na página de anotações do Kindle. Veja como em Estante → Highlights.", bad: true });
      return;
    }
    async function onMessage(e: MessageEvent) {
      if (!AMAZON.test(e.origin) || e.data?.type !== "toso-kindle" || got.current) return;
      // Uma entrega por aba: para de chamar a Amazon e ignora reenvios.
      got.current = true;
      clearInterval(t);
      const rows = (Array.isArray(e.data.rows) ? e.data.rows : []) as Row[];
      const reply = (text: string) => (e.source as Window | null)?.postMessage({ type: "toso-done", text }, e.origin);
      let added = 0;
      let updated = 0;
      try {
        for (let i = 0; i < rows.length; i += 400) {
          setStatus({ text: `Gravando ${Math.min(i + 400, rows.length)} de ${rows.length} highlights…` });
          const res = await fetch("/api/estante", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "amazon", rows: rows.slice(i, i + 400) }) });
          const data = (await res.json().catch(() => ({}))) as { added?: number; updated?: number; error?: string };
          if (!res.ok) throw new Error(data.error ?? `erro ${res.status}`);
          added += data.added ?? 0;
          updated += data.updated ?? 0;
        }
        const text = `${rows.length} highlights de ${e.data.books} livros: ${added} novos, ${updated} atualizados.`;
        setStatus({ text, done: true });
        reply(text);
      } catch (err) {
        const text = `Não foi possível gravar: ${(err as Error).message}`;
        setStatus({ text, bad: true });
        reply(text);
      }
    }
    // Avisa a página da Amazon que esta aba está pronta (de novo a cada
    // segundo, caso ela ainda esteja lendo os livros).
    const ping = () => window.opener?.postMessage({ type: "toso-ready" }, "*");
    ping();
    const t = setInterval(ping, 1000);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(t);
    };
  }, []);

  return (
    <section className="hod-big" style={{ marginTop: 22 }}>
      <p className={status.bad ? "form-error" : "form-note"} style={{ margin: 0, fontSize: 15 }}>
        {status.text}
      </p>
      {status.done && (
        <p style={{ marginTop: 14 }}>
          <Link className="btn btn-primary btn-sm" href="/estante?aba=destaques">
            Ver os highlights
          </Link>
        </p>
      )}
    </section>
  );
}
