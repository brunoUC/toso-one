import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/convex";
import { GitHubError, dispatchCollection, githubConfigured } from "@/lib/github";

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Entre primeiro." }, { status: 401 });
  if (!githubConfigured()) return NextResponse.json({ error: "GITHUB_TOKEN não configurado." }, { status: 503 });
  try {
    const { actionsUrl } = await dispatchCollection();
    await logEvent("collect_dispatched", "Flight Tracker");
    return NextResponse.json({ ok: true, actionsUrl });
  } catch (err) {
    const status = err instanceof GitHubError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
