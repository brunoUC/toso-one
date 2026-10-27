// Base de aeroportos (src/data/airports.json, gerada por
// scripts/build-airports.py a partir do OurAirports). Compartilhada entre o
// servidor (validação) e o navegador (busca), por isso sem "server-only".

export type Airport = {
  i: string; // IATA
  c: string; // cidade (em português quando conhecida)
  n: string; // nome do aeroporto
  k: string; // país, ISO 3166
  l: boolean; // aeroporto grande
  a?: string; // apelidos de busca
};

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["pt-BR"], { type: "region" }) : null;

export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

// Ordem: código exato, cidade que começa com o texto, depois o resto;
// aeroportos grandes antes dos médios em cada faixa.
export function searchAirports(list: Airport[], query: string, limit = 8): Airport[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of list) {
    const code = a.i.toLowerCase();
    const city = normalize(a.c);
    let s = -1;
    if (code === q) s = 100;
    else if (city === q) s = 90;
    else if (city.startsWith(q)) s = 80;
    else if (code.startsWith(q)) s = 70;
    else {
      const hay = `${city} ${normalize(a.n)} ${a.a ?? ""} ${normalize(countryName(a.k))}`;
      if (hay.includes(q)) s = 50;
    }
    if (s >= 0) scored.push({ a, s: s + (a.l ? 5 : 0) });
  }
  return scored.sort((x, y) => y.s - x.s || x.a.c.localeCompare(y.a.c)).slice(0, limit).map((x) => x.a);
}
