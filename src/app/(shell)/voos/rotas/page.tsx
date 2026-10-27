import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { githubConfigured, readRoutesFile } from "@/lib/github";
import { RoutesEditor } from "./RoutesEditor";

export const metadata: Metadata = { title: "Editar rotas" };

export default async function RotasPage() {
  await requireSession("/voos/rotas");

  let content: React.ReactNode;
  if (!githubConfigured()) {
    content = (
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Para salvar daqui, o toso one precisa de um token do GitHub com acesso ao repositório do Flight Tracker.
        </p>
        <ol style={{ color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.7 }}>
          <li>
            GitHub → Settings → Developer settings → <b>Fine-grained tokens</b> → Generate new token.
          </li>
          <li>
            Repository access: <b>Only select repositories</b> → Flight_Tracker.
          </li>
          <li>
            Permissions: <b>Contents: Read and write</b> e <b>Actions: Read and write</b>.
          </li>
          <li>
            Na Vercel, cadastre o token como <code>GITHUB_TOKEN</code> e faça um Redeploy.
          </li>
        </ol>
      </div>
    );
  } else {
    try {
      const file = await readRoutesFile();
      content = <RoutesEditor initialConfig={file.config} initialSha={file.sha} />;
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
          <p className="eyebrow">voos · routes.json</p>
          <h1>Editar rotas</h1>
        </div>
      </div>
      {content}
    </main>
  );
}
