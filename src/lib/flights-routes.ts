import "server-only";
import { relyingParty } from "./auth";
import { logEvent } from "./convex";
import { FlightsApiError, flightsApi, type RoutesConfig } from "./flights-api";

// Gravação de rotas e coleta direcionada, compartilhadas pelo editor, pelo
// ajuste de datas na página de Voos e pelo "monitorar" da busca.

export type RouteCfg = RoutesConfig["routes"][number];

// Combinações por rota numa coleta direcionada. O Flight Tracker limita a 10
// (MAX_SAMPLES); 6 cobre bem uma janela nova sem pesar no Google.
export const TARGETED_SAMPLES = 6;

const idOf = (r: Pick<RouteCfg, "origin" | "destination">) => `${r.origin}-${r.destination}`;

// Rotas ativas que são novas ou mudaram onde importa para a coleta.
export function changedRouteIds(before: RouteCfg[], after: RouteCfg[]): string[] {
  const prev = new Map(before.map((r) => [idOf(r), r]));
  return after
    .filter((r) => {
      if (!r.active) return false;
      const p = prev.get(idOf(r));
      return !p || !p.active || p.window.join() !== r.window.join() || p.stay.join() !== r.stay.join();
    })
    .map(idOf);
}

export async function readRoutes(): Promise<{ config: RoutesConfig; sha: string }> {
  return flightsApi<{ config: RoutesConfig; sha: string }>("config");
}

export async function writeRoutes(config: RoutesConfig, sha: string): Promise<string> {
  // A página própria do Flight Tracker usa hub_url nos botões de navegação.
  const { origin } = await relyingParty();
  const full = { ...config, ...(origin.startsWith("http://localhost") ? {} : { hub_url: origin }) };
  const saved = await flightsApi<{ sha: string }>("config", { method: "PUT", body: { config: full, sha } });
  return saved.sha;
}

export type CollectResult = { ok: true; routes: string[] } | { ok: false; routes: string[]; error: string };

// Dispara a coleta só das rotas pedidas. Uma falha aqui não desfaz a
// gravação: as rotas entram na próxima coleta agendada de qualquer jeito.
export async function collectRoutes(routes: string[], pairs: [string, string, string][] = []): Promise<CollectResult> {
  if (routes.length === 0) return { ok: true, routes };
  try {
    await flightsApi("run", {
      method: "POST",
      body: { routes, samples: TARGETED_SAMPLES, ...(pairs.length ? { pairs } : {}) },
    });
    await logEvent("collect_dispatched", routes.join(", "));
    return { ok: true, routes };
  } catch (err) {
    return { ok: false, routes, error: err instanceof FlightsApiError ? err.message : (err as Error).message };
  }
}

export function collectMessage(c: CollectResult): string {
  if (c.routes.length === 0) return "";
  const list = c.routes.length > 4 ? `${c.routes.slice(0, 4).join(", ")} e mais ${c.routes.length - 4}` : c.routes.join(", ");
  return c.ok
    ? `Coleta disparada para ${list}; os preços aparecem em 10 a 30 minutos.`
    : `A coleta não começou (${c.error}); as rotas entram na próxima coleta agendada.`;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const IATA = /^[A-Z]{3}$/;

export function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function errorJson(err: unknown): { body: { error: string; details?: unknown }; status: number } {
  const e = err instanceof FlightsApiError ? err : new FlightsApiError((err as Error).message, 500);
  return { body: { error: e.message, details: e.details }, status: e.status };
}
