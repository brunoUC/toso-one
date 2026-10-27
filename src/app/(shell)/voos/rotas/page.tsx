import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { flightsApi, flightsApiConfigured, type RoutesConfig } from "@/lib/flights-api";
import { RoutesEditor } from "./RoutesEditor";

export const metadata: Metadata = { title: "Editar rotas" };

export default async function RotasPage() {
  await requireSession("/voos/rotas");

  let content: React.ReactNode;
  if (!flightsApiConfigured()) {
    content = (
      <div className="card">
        <p style={{ marginTop: 0 }}>
          O editor usa a API do próprio Flight Tracker. Falta dizer ao toso one onde ela está e qual é a senha:
        </p>
        <ol style={{ color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.7 }}>
          <li>
            <code>FLIGHTS_URL</code>: o endereço do Flight Tracker na Vercel.
          </li>
          <li>
            <code>FLIGHTS_EDIT_PASSWORD</code>: o mesmo valor de <code>MONITOR_EDIT_PASSWORD</code> do projeto do Flight Tracker.
          </li>
          <li>Cadastre as duas na Vercel do toso one e faça um Redeploy.</li>
        </ol>
      </div>
    );
  } else {
    try {
      const [config, schedule] = await Promise.all([
        flightsApi<{ config: RoutesConfig; sha: string }>("config"),
        flightsApi<{ times: string[]; sha: string }>("schedule").catch(() => null),
      ]);
      content = (
        <RoutesEditor
          initialConfig={config.config}
          initialSha={config.sha}
          initialTimes={schedule?.times ?? null}
          scheduleSha={schedule?.sha ?? null}
        />
      );
    } catch (err) {
      content = <div className="card form-error">{(err as Error).message}</div>;
    }
  }

  return (
    <main className="page">
      <div className="fl-head">
        <Link href="/voos" className="btn btn-ghost btn-sm" aria-label="Voltar para Voos">
          <Icon name="back" size={15} />
        </Link>
        <div>
          <p className="eyebrow">voos · o que monitorar</p>
          <h1>Editar rotas</h1>
        </div>
      </div>
      {content}
    </main>
  );
}
