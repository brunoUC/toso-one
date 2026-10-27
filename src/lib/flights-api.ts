import "server-only";
import { flightsUrl } from "./flights";

// O Flight Tracker tem a própria API de edição (funções da Vercel em api/
// daquele repositório): ela lê e grava routes.json e o horário do workflow
// pelo GitHub, valida e dispara a coleta. O toso one só repassa os pedidos,
// do servidor, com a senha MONITOR_EDIT_PASSWORD daquele projeto — o
// navegador nunca vê a senha, e não existe um segundo token do GitHub.

export function flightsApiConfigured(): boolean {
  return Boolean(flightsUrl() && process.env.FLIGHTS_EDIT_PASSWORD);
}

export class FlightsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function flightsApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const base = flightsUrl();
  if (!base || !process.env.FLIGHTS_EDIT_PASSWORD) {
    throw new FlightsApiError("Editor não configurado: faltam FLIGHTS_URL e FLIGHTS_EDIT_PASSWORD.", 503);
  }
  let res: Response;
  try {
    res = await fetch(`${base}/api/${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${process.env.FLIGHTS_EDIT_PASSWORD}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new FlightsApiError(`Não consegui falar com o Flight Tracker: ${(err as Error).message}`, 502);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
  if (!res.ok) {
    const hint =
      res.status === 401 ? " Confira se FLIGHTS_EDIT_PASSWORD é igual ao MONITOR_EDIT_PASSWORD do Flight Tracker." : "";
    throw new FlightsApiError((data.error ?? `O Flight Tracker respondeu ${res.status}.`) + hint, res.status, data.details);
  }
  return data as T;
}

export type RoutesConfig = Record<string, unknown> & {
  targets: { buy: number; max: number };
  samples_per_run: number;
  routes: {
    id: string;
    origin: string;
    destination: string;
    city: string;
    window: [string, string];
    stay: [number, number];
    active: boolean;
    targets?: { buy?: number; max?: number };
  }[];
};

export type Run = {
  id: number;
  event: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  createdAt: string;
  url: string;
};
