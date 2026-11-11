import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";
import { amazonHighlights, parseKindle, storygraphItems, type AmazonRow } from "@/lib/estante-import";

// Edições da Estante: adicionar, mudar a situação, apagar e importar
// (StoryGraph e Kindle). Confere a sessão e repassa ao Convex.

type Body =
  | {
      action: "add";
      kind: string;
      status: string;
      title: string;
      creator?: string;
      year?: number;
      cover?: string;
      ref?: string;
      recommendedBy?: string;
      note?: string;
    }
  | { action: "update"; id: string; status?: string; recommendedBy?: string; note?: string; rating?: number | null }
  | { action: "remove"; id: string }
  | { action: "removeHighlight"; id: string }
  | { action: "storygraph"; csv: string }
  | { action: "kindle"; content: string }
  | { action: "amazon"; rows: AmazonRow[] };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
// O Convex não aceita campos undefined: some com eles antes de mandar.
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  const b = (await request.json().catch(() => null)) as Body | null;
  const secret = serverSecret();
  const c = convex();
  try {
    switch (b?.action) {
      case "add":
        return NextResponse.json(
          await c.mutation(
            api.estante.add,
            clean({
              secret,
              kind: str(b.kind, 10) ?? "",
              status: str(b.status, 10) ?? "want",
              title: str(b.title) ?? "",
              creator: str(b.creator),
              year: typeof b.year === "number" ? b.year : undefined,
              cover: str(b.cover, 500),
              ref: str(b.ref, 120),
              recommendedBy: str(b.recommendedBy, 80),
              note: str(b.note, 1000),
            }),
          ),
        );
      case "update":
        await c.mutation(
          api.estante.update,
          clean({ secret, id: str(b.id, 64) ?? "", status: str(b.status, 10), recommendedBy: str(b.recommendedBy, 80), note: str(b.note, 1000), rating: b.rating }),
        );
        return NextResponse.json({ ok: true });
      case "remove":
        await c.mutation(api.estante.remove, { secret, id: str(b.id, 64) ?? "" });
        return NextResponse.json({ ok: true });
      case "removeHighlight":
        await c.mutation(api.estante.removeHighlight, { secret, id: str(b.id, 64) ?? "" });
        return NextResponse.json({ ok: true });
      case "storygraph": {
        const items = storygraphItems(String(b.csv ?? ""));
        if (!items.length) return NextResponse.json({ error: "Nenhum livro encontrado no arquivo." }, { status: 400 });
        let added = 0;
        let updated = 0;
        for (const part of chunks(items, 200)) {
          const r = (await c.mutation(api.estante.importItems, clean({ secret, items: part }))) as { added: number; updated: number };
          added += r.added;
          updated += r.updated;
        }
        return NextResponse.json({ total: items.length, added, updated });
      }
      case "kindle":
      case "amazon": {
        const rows = b.action === "kindle" ? parseKindle(String(b.content ?? "")) : amazonHighlights(Array.isArray(b.rows) ? b.rows.slice(0, 20000) : []);
        if (!rows.length) return NextResponse.json({ error: "Nenhum highlight encontrado no arquivo." }, { status: 400 });
        let added = 0;
        let updated = 0;
        for (const part of chunks(rows, 300)) {
          const r = (await c.mutation(api.estante.importHighlights, clean({ secret, rows: part }))) as { added: number; updated: number };
          added += r.added;
          updated += r.updated;
        }
        return NextResponse.json({ total: rows.length, added, updated, books: new Set(rows.map((r) => r.book)).size });
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg.match(/Error: ([^\n]+)/)?.[1] ?? msg }, { status: 400 });
  }
}
