// Onde um preço cai em relação ao alvo e ao teto da rota. Usado no mapa, nos
// grupos por destino e na busca (servidor e navegador, por isso sem
// "server-only"). A cor sempre vem acompanhada do texto.

export type Targets = { buy: number; max: number };
export type FareStatus = "below" | "between" | "above" | "none";

export const STATUS_LABEL: Record<FareStatus, string> = {
  below: "abaixo do alvo",
  between: "entre alvo e teto",
  above: "acima do teto",
  none: "sem dados",
};

export function fareStatus(price: number | null | undefined, t: Targets): FareStatus {
  if (price == null) return "none";
  if (price <= t.buy) return "below";
  if (price <= t.max) return "between";
  return "above";
}

const money = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const pct = (part: number, of: number) => `${Math.max(1, Math.round((part / of) * 100))}%`;

// "13% abaixo do alvo", "15% acima do alvo", "13% acima do teto".
export function distanceShort(price: number | null | undefined, t: Targets): string {
  if (price == null) return "sem preço ainda";
  if (price <= t.buy) return `${pct(t.buy - price, t.buy)} abaixo do alvo`;
  if (price <= t.max) return `${pct(price - t.buy, t.buy)} acima do alvo`;
  return `${pct(price - t.max, t.max)} acima do teto`;
}

// "R$ 1.435 (13%) abaixo do alvo", "R$ 1.686 (15%) acima do alvo · R$ 314
// abaixo do teto", "R$ 1.646 (13%) acima do teto".
export function distanceText(price: number | null | undefined, t: Targets): string {
  if (price == null) return "ainda sem preço coletado";
  if (price <= t.buy) {
    const d = t.buy - price;
    return d < 1 ? "exatamente no alvo" : `${money(d)} (${pct(d, t.buy)}) abaixo do alvo`;
  }
  if (price <= t.max) {
    const up = price - t.buy;
    const left = t.max - price;
    return `${money(up)} (${pct(up, t.buy)}) acima do alvo · ${left < 1 ? "no teto" : `${money(left)} abaixo do teto`}`;
  }
  const d = price - t.max;
  return `${money(d)} (${pct(d, t.max)}) acima do teto`;
}
