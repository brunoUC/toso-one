import { getSession } from "@/lib/auth";

// Repassa fotos e vídeos do Instagram: o CDN deles não deixa embutir em
// outro site. Só para quem está logado e só para os domínios do CDN do
// Instagram/Facebook, para não virar um proxy aberto.

const ALLOWED = [/\.cdninstagram\.com$/, /\.fbcdn\.net$/];

export async function GET(request: Request) {
  if (!(await getSession())) return new Response("Entre primeiro.", { status: 401 });
  const raw = new URL(request.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Endereço inválido.", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.some((re) => re.test(target.hostname))) {
    return new Response("Domínio não permitido.", { status: 400 });
  }

  const range = request.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0", ...(range ? { Range: range } : {}) },
      redirect: "error",
    });
  } catch {
    return new Response("Falha ao buscar a mídia.", { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    // 403 = link vencido: o próximo ciclo do feed traz um novo.
    return new Response(null, { status: upstream.status === 403 ? 410 : 502 });
  }

  // Só imagem e vídeo: nada que o navegador possa rodar como página.
  const type = upstream.headers.get("content-type") ?? "";
  if (!/^(image|video)\//.test(type)) return new Response("Tipo não permitido.", { status: 415 });

  const headers = new Headers({
    "Content-Type": type,
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const val = upstream.headers.get(h);
    if (val) headers.set(h, val);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
