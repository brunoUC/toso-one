// Link para uma busca no Google Flights, montado do mesmo jeito que a
// fast-flights monta o parâmetro `tfs` (protobuf em base64): mesmas datas,
// executiva, 1 adulto. Assim a busca do toso one abre exatamente a consulta
// que a coleta faz, sem precisar do Python. Conferido byte a byte contra
// TFSData.as_b64() da fast-flights 2.2.

function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

const field = (num: number, wire: number) => varint((num << 3) | wire);
const bytes = (num: number, data: number[]) => [...field(num, 2), ...varint(data.length), ...data];
const text = (num: number, s: string) => bytes(num, [...new TextEncoder().encode(s)]);
const int = (num: number, v: number) => [...field(num, 0), ...varint(v)];

function leg(date: string, from: string, to: string): number[] {
  // FlightData: date (2), from_airport (13 → Airport.airport 2), to_airport (14)
  return [...text(2, date), ...bytes(13, text(2, from)), ...bytes(14, text(2, to))];
}

export function googleFlightsUrl(origin: string, destination: string, depart: string, ret?: string | null): string {
  const msg = [
    ...bytes(3, leg(depart, origin, destination)),
    ...(ret ? bytes(3, leg(ret, destination, origin)) : []),
    ...bytes(8, [1]), // passageiros: 1 adulto (repeated, empacotado)
    ...int(9, 3), // assento: executiva
    ...int(19, ret ? 1 : 2), // viagem: ida e volta (1) ou só ida (2)
  ];
  let bin = "";
  for (const b of msg) bin += String.fromCharCode(b);
  const tfs = btoa(bin);
  return `https://www.google.com/travel/flights/search?${new URLSearchParams({ tfs, hl: "pt-BR", curr: "BRL" })}`;
}
