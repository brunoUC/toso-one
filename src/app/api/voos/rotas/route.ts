import { NextResponse } from "next/server";
import { getSession, relyingParty } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { GitHubError, githubConfigured, readRoutesFile, writeRoutesFile } from "@/lib/github";
import { describeChanges, validateConfig, type RouteConfig } from "@/lib/routes-config";

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!githubConfigured()) return NextResponse.json({ error: "GITHUB_TOKEN não configurado." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { config?: unknown; sha?: unknown } | null;
  if (!body || typeof body.sha !== "string") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  try {
    // Relê o arquivo: valida contra o estado atual e preserva o que o editor
    // não controla. O sha garante que ninguém salvou no meio do caminho.
    const current = await readRoutesFile();
    if (current.sha !== body.sha) {
      return NextResponse.json({ error: "O routes.json mudou desde que você abriu o editor. Recarregue a página." }, { status: 409 });
    }
    const { config, errors } = validateConfig(body.config, current.config);
    if (errors.length) return NextResponse.json({ error: "Corrija antes de salvar.", details: errors }, { status: 422 });

    // A página própria do Flight Tracker usa hub_url nos botões de navegação.
    const { origin } = await relyingParty();
    if (!origin.startsWith("http://localhost")) config.hub_url = origin;

    const summary = describeChanges((current.config.routes ?? []) as RouteConfig[], config.routes);
    const saved = await writeRoutesFile(config, current.sha, `rotas: ${summary} (editor do toso one)`);
    await logEvent("routes_saved", summary);
    return NextResponse.json({ ok: true, sha: saved.sha, commitUrl: saved.commitUrl, config });
  } catch (err) {
    const status = err instanceof GitHubError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status: status >= 400 ? status : 500 });
  }
}
