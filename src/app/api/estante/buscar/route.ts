import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchShelf } from "@/lib/estante";

// Busca por nome para adicionar à Estante (livro, ou filme/série).
export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("tipo") === "tela" ? "screen" : "book";
  const results = await searchShelf(url.searchParams.get("q") ?? "", type);
  return NextResponse.json({ results });
}
