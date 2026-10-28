import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { api, convex, convexConfigured, serverSecret } from "@/lib/convex";

// Todas as edições das Finanças passam por aqui: confere a sessão e repassa
// ao Convex com o segredo do servidor.
type Body =
  | { action: "categorize"; txId: string; category: string; applySimilar: boolean }
  | { action: "reset"; txId: string }
  | { action: "note"; txId: string; note: string }
  | { action: "deleteRule"; ruleId: string }
  | { action: "addCategory"; name: string; group: string }
  | { action: "saveGoal"; id?: string; name: string; target: number; deadline?: string; source: string; manualValue?: number; scope?: string }
  | { action: "deleteGoal"; id: string }
  | { action: "budget"; lineId: string; limit: number | null }
  | { action: "sync" };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!convexConfigured()) return NextResponse.json({ error: "Convex não configurado." }, { status: 503 });
  const b = (await request.json().catch(() => null)) as Body | null;
  const secret = serverSecret();
  const c = convex();
  try {
    switch (b?.action) {
      case "categorize":
        return NextResponse.json(
          await c.mutation(api.financas.data.setCategory, { secret, txId: str(b.txId), category: str(b.category, 60), applySimilar: Boolean(b.applySimilar) }),
        );
      case "reset":
        await c.mutation(api.financas.data.resetCategory, { secret, txId: str(b.txId) });
        return NextResponse.json({ ok: true });
      case "note":
        await c.mutation(api.financas.data.setNote, { secret, txId: str(b.txId), note: str(b.note, 500) });
        return NextResponse.json({ ok: true });
      case "deleteRule":
        await c.mutation(api.financas.data.deleteRule, { secret, ruleId: str(b.ruleId) });
        return NextResponse.json({ ok: true });
      case "addCategory":
        return NextResponse.json({ slug: await c.mutation(api.financas.data.addCategory, { secret, name: str(b.name, 40), group: str(b.group, 40) }) });
      case "saveGoal": {
        const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
        await c.mutation(api.financas.data.saveGoal, {
          secret,
          ...(b.id ? { id: str(b.id) } : {}),
          name: str(b.name, 60),
          target: num(b.target) ?? 0,
          ...(b.deadline ? { deadline: str(b.deadline, 7) } : {}),
          source: str(b.source, 20),
          ...(num(b.manualValue) !== undefined ? { manualValue: num(b.manualValue) } : {}),
          ...(b.scope ? { scope: str(b.scope, 60) } : {}),
        });
        return NextResponse.json({ ok: true });
      }
      case "deleteGoal":
        await c.mutation(api.financas.data.deleteGoal, { secret, id: str(b.id) });
        return NextResponse.json({ ok: true });
      case "budget": {
        const limit = typeof b.limit === "number" && Number.isFinite(b.limit) && b.limit >= 0 ? Math.round(b.limit) : null;
        await c.mutation(api.financas.data.setBudgetLimit, { secret, lineId: str(b.lineId, 40), limit });
        return NextResponse.json({ ok: true });
      }
      case "sync":
        await c.action(api.financas.sync.syncNow, { secret });
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Pedido desconhecido." }, { status: 400 });
    }
  } catch (err) {
    const msg = (err as Error).message.replace(/^.*Uncaught Error: /s, "").split("\n")[0];
    return NextResponse.json({ error: msg || "Não deu certo." }, { status: 400 });
  }
}
