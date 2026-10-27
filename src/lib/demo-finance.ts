// Dados de EXEMPLO para o app de Finanças, até a carteira real ser conectada.
// Determinísticos (mesma semente sempre), para a tela não mudar a cada visita.

export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type MonthPoint = {
  label: string; // "out/26"
  month: number; // 0–11
  year: number;
  netWorth: number;
  invested: number;
  contribution: number;
  monthlyReturn: number; // fração: 0.012 = +1,2%
};

function series(): MonthPoint[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: MonthPoint[] = [];
  let nw = 560000;
  let inv = 520000;
  for (let i = 0; i < 36; i++) {
    const month = (10 + i) % 12; // i=0 → nov/2023, i=35 → out/2026
    const year = 2023 + Math.floor((10 + i) / 12);
    const contribution = 9000 + rnd() * 7000 + (i > 24 ? 2000 : 0);
    const monthlyReturn = (rnd() - 0.32) * 0.045;
    inv += contribution;
    nw = nw * (1 + monthlyReturn) + contribution;
    out.push({ label: `${MONTHS[month]}/${String(year).slice(2)}`, month, year, netWorth: nw, invested: inv, contribution, monthlyReturn });
  }
  const scale = 1243870.52 / out[out.length - 1].netWorth;
  return out.map((d) => ({ ...d, netWorth: d.netWorth * scale, invested: d.invested * scale * 0.93 }));
}

export const DEMO_SERIES = series();

export const DEMO_ALLOCATION = [
  { name: "Renda fixa", slot: 1, pct: 34, target: 38 },
  { name: "Exterior", slot: 2, pct: 26, target: 22 },
  { name: "Ações BR", slot: 3, pct: 21, target: 22 },
  { name: "FIIs", slot: 4, pct: 11, target: 12 },
  { name: "Outros", slot: 5, pct: 8, target: 6 },
];

export const DEMO_GOALS = [
  { name: "Independência financeira", current: 1_243_870, target: 5_000_000, pace: 0.22, foot: { good: true, text: "3 meses adiantado", rest: "previsão mar/2038" } },
  { name: "Reserva de emergência", current: 120_000, target: 120_000, pace: null, foot: { good: true, text: "", rest: "Concluída em jun/2026" } },
  { name: "Viagem Europa · mai/2027", current: 27_400, target: 40_000, pace: 0.75, foot: { good: false, text: "R$ 2,6 mil atrás do ritmo", rest: "faltam 6 meses" } },
];

export const DEMO_TILES = {
  savingsRate: [38, 37, 36, 39, 35, 36, 34, 33, 35, 36, 33, 34],
  passiveIncome: [6100, 6300, 6400, 6600, 6700, 6900, 7000, 7200, 7400, 7500, 7600, 7980],
};
