import "server-only";

// O routes.json mora no repositório do Flight Tracker. O editor lê e grava
// pela API de conteúdo do GitHub (cada "Salvar" é um commit), assim o git
// continua sendo a fonte da verdade e a coleta não muda nada.
//
// GITHUB_TOKEN: token fine-grained, só no repositório do Flight Tracker, com
// Contents: Read and write (salvar) e Actions: Read and write (Coletar agora).

// GITHUB_API_URL só existe para testes locais contra um servidor falso.
const API = process.env.GITHUB_API_URL || "https://api.github.com";

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

function repo(): string {
  return process.env.FLIGHTS_REPO || "brunoUC/Flight_Tracker";
}

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/repos/${repo()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export class GitHubError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  const hint =
    res.status === 401 ? " (token inválido ou expirado)" :
    res.status === 403 || res.status === 404 ? " (o token não tem acesso a este repositório ou permissão)" :
    res.status === 409 ? " (alguém salvou antes — recarregue)" : "";
  throw new GitHubError(`${what}: ${body.message ?? res.statusText}${hint}`, res.status);
}

export type RoutesFile = { config: Record<string, unknown>; sha: string };

export async function readRoutesFile(): Promise<RoutesFile> {
  const res = await gh("/contents/routes.json");
  if (!res.ok) await fail(res, "Não consegui ler o routes.json");
  const body = (await res.json()) as { content: string; sha: string };
  const text = Buffer.from(body.content, "base64").toString("utf-8");
  return { config: JSON.parse(text), sha: body.sha };
}

export async function writeRoutesFile(config: unknown, sha: string, message: string) {
  const content = Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf-8").toString("base64");
  const res = await gh("/contents/routes.json", {
    method: "PUT",
    body: JSON.stringify({ message, content, sha }),
  });
  if (!res.ok) await fail(res, "Não consegui salvar");
  const body = (await res.json()) as { content: { sha: string }; commit: { sha: string; html_url: string } };
  return { sha: body.content.sha, commitSha: body.commit.sha, commitUrl: body.commit.html_url };
}

export async function dispatchCollection() {
  const repoRes = await gh("");
  if (!repoRes.ok) await fail(repoRes, "Não consegui ler o repositório");
  const { default_branch } = (await repoRes.json()) as { default_branch: string };
  const workflow = process.env.FLIGHTS_WORKFLOW || "monitor.yml";
  const res = await gh(`/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: default_branch }),
  });
  if (!res.ok) await fail(res, "Não consegui iniciar a coleta");
  return { actionsUrl: `https://github.com/${repo()}/actions/workflows/${workflow}` };
}
