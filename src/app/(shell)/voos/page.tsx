import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Voos" };

export default function VoosPage() {
  // FLIGHTS_URL também alimenta o rewrite /voos/painel (next.config.ts).
  const source = process.env.FLIGHTS_URL?.replace(/\/+$/, "");

  return (
    <main className="page-wide">
      <div className="embed-head">
        <Link href="/" className="btn btn-ghost btn-sm" aria-label="Voltar ao início">
          <Icon name="back" size={15} />
        </Link>
        <h1>Voos</h1>
        <span className="grow" />
        {source && (
          <a className="btn btn-ghost btn-sm" href={source} target="_blank" rel="noreferrer">
            <Icon name="external" size={15} />
            Abrir sozinho
          </a>
        )}
      </div>
      {source ? (
        <iframe className="embed-frame" src="/voos/painel" title="Monitor de tarifas" />
      ) : (
        <div className="card empty">
          Defina <code>FLIGHTS_URL</code> com o endereço do Flight Tracker na Vercel e faça um novo deploy.
        </div>
      )}
    </main>
  );
}
