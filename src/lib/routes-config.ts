import "server-only";
import airports from "@/data/airports.json";
import type { Airport } from "./airports";

// Validação do routes.json editado. O editor só mexe em rotas, alvos e
// amostras; o resto do arquivo (moeda, classe, adultos…) passa intacto.

export type RouteConfig = {
  id: string;
  origin: string;
  destination: string;
  city: string;
  window: [string, string];
  stay: [number, number];
  active: boolean;
  targets?: { buy: number; max: number };
};

export type EditableConfig = {
  targets: { buy: number; max: number };
  samples_per_run: number;
  routes: RouteConfig[];
};

const BY_CODE = new Map((airports as Airport[]).map((a) => [a.i, a]));

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

export function validateConfig(input: unknown, original: Record<string, unknown>) {
  const errors: string[] = [];
  const src = (input ?? {}) as Partial<EditableConfig>;

  const t = src.targets;
  if (!t || !isInt(t.buy, 1, 1_000_000) || !isInt(t.max, 1, 1_000_000) || t.buy > t.max) {
    errors.push("Padrões: alvo e teto precisam ser valores inteiros, com o alvo menor ou igual ao teto.");
  }
  if (!isInt(src.samples_per_run, 1, 6)) errors.push("Consultas por rota por dia: entre 1 e 6.");

  const routes: RouteConfig[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of (Array.isArray(src.routes) ? src.routes : []).entries()) {
    const r = raw as Partial<RouteConfig>;
    const label = r.origin && r.destination ? `${r.origin}→${r.destination}` : `Rota ${index + 1}`;
    const o = typeof r.origin === "string" ? r.origin.toUpperCase() : "";
    const d = typeof r.destination === "string" ? r.destination.toUpperCase() : "";
    if (!BY_CODE.has(o) || !BY_CODE.has(d)) {
      errors.push(`${label}: aeroporto desconhecido.`);
      continue;
    }
    if (o === d) errors.push(`${label}: origem e destino iguais.`);
    const id = `${o}-${d}`;
    if (seen.has(id)) errors.push(`${label}: rota repetida.`);
    seen.add(id);

    if (!Array.isArray(r.window) || !isDate(r.window[0]) || !isDate(r.window[1]) || r.window[0] > r.window[1]) {
      errors.push(`${label}: janela de ida inválida: a primeira data precisa vir antes da última.`);
    }
    if (!Array.isArray(r.stay) || !isInt(r.stay[0], 1, 60) || !isInt(r.stay[1], 1, 60) || r.stay[0] > r.stay[1]) {
      errors.push(`${label}: permanência entre 1 e 60 dias, mínima ≤ máxima.`);
    }
    let targets: RouteConfig["targets"];
    if (r.targets) {
      if (!isInt(r.targets.buy, 1, 1_000_000) || !isInt(r.targets.max, 1, 1_000_000) || r.targets.buy > r.targets.max) {
        errors.push(`${label}: alvo próprio precisa ser ≤ teto próprio.`);
      } else targets = { buy: r.targets.buy, max: r.targets.max };
    }
    routes.push({
      id,
      origin: o,
      destination: d,
      city: typeof r.city === "string" && r.city.trim() ? r.city.trim().slice(0, 60) : BY_CODE.get(d)!.c,
      window: [r.window?.[0] ?? "", r.window?.[1] ?? ""],
      stay: [r.stay?.[0] ?? 0, r.stay?.[1] ?? 0],
      active: r.active !== false,
      ...(targets ? { targets } : {}),
    });
  }
  if (routes.length === 0) errors.push("Mantenha pelo menos uma rota.");

  const config: Record<string, unknown> & { routes: RouteConfig[] } = {
    ...original,
    targets: src.targets,
    samples_per_run: src.samples_per_run,
    routes,
  };
  return { config, errors };
}

export function describeChanges(before: RouteConfig[], after: RouteConfig[]): string {
  const prev = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  const next = new Map(after.map((r) => [r.id, JSON.stringify(r)]));
  const parts: string[] = [];
  for (const [id, json] of next) {
    if (!prev.has(id)) parts.push(`+${id}`);
    else if (prev.get(id) !== json) parts.push(`~${id}`);
  }
  for (const id of prev.keys()) if (!next.has(id)) parts.push(`−${id}`);
  return parts.length ? parts.join(", ") : "padrões";
}
