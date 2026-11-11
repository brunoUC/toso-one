import "server-only";
import type { IconName } from "@/components/Icon";
import type { Place } from "./place";

// Previsão pelo Open-Meteo (gratuito, sem chave) para onde ele está
// (src/lib/place.ts). Cache de 30 minutos por lugar. Dias e horas vêm no
// fuso do próprio lugar, então viajando o "hoje" é o de lá.

export type DayWeather = { date: string; code: number; max: number; min: number; rain: number; label: string; icon: IconName };
export type Weather = {
  place: string | null;
  source: Place["source"];
  now: { temp: number; feels: number; code: number; label: string; icon: IconName };
  days: DayWeather[];
  // Frase curta sobre a chuva de hoje ("chuva provável a partir das 15h").
  rainHint: string | null;
};

// Códigos WMO usados pelo Open-Meteo.
export function describe(code: number): { label: string; icon: IconName } {
  if (code === 0) return { label: "Céu limpo", icon: "sun" };
  if (code <= 2) return { label: "Poucas nuvens", icon: "cloudSun" };
  if (code === 3) return { label: "Nublado", icon: "cloud" };
  if (code <= 48) return { label: "Neblina", icon: "fog" };
  if (code <= 57) return { label: "Garoa", icon: "rain" };
  if (code <= 67) return { label: "Chuva", icon: "rain" };
  if (code <= 77) return { label: "Neve", icon: "cloud" };
  if (code <= 82) return { label: "Pancadas de chuva", icon: "rain" };
  return { label: "Tempestade", icon: "storm" };
}

type Raw = {
  current: { time: string; temperature_2m: number; apparent_temperature: number; weather_code: number };
  hourly: { time: string[]; precipitation_probability: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

function rainHint(raw: Raw, today: string, nowHour: number): string | null {
  const hours = raw.hourly.time
    .map((t, i) => ({ date: t.slice(0, 10), hour: Number(t.slice(11, 13)), p: raw.hourly.precipitation_probability[i] ?? 0 }))
    .filter((h) => h.date === today && h.hour >= nowHour && h.hour <= 22);
  const wet = hours.filter((h) => h.p >= 50);
  if (!wet.length) return null;
  const first = wet[0];
  const peak = Math.max(...wet.map((h) => h.p));
  const when = first.hour <= nowHour ? "agora" : `a partir das ${first.hour}h`;
  return `Chuva provável ${when} (${peak}%). Leve guarda-chuva.`;
}

export async function getWeather(place: Place): Promise<Weather | null> {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "temperature_2m,apparent_temperature,weather_code",
    hourly: "precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "8",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as Raw;
    // "Agora" no fuso do lugar (current.time vem como AAAA-MM-DDTHH:MM local).
    const today = raw.current.time.slice(0, 10);
    const nowHour = Number(raw.current.time.slice(11, 13));
    const d = raw.daily;
    return {
      place: place.name,
      source: place.source,
      now: {
        temp: Math.round(raw.current.temperature_2m),
        feels: Math.round(raw.current.apparent_temperature),
        code: raw.current.weather_code,
        ...describe(raw.current.weather_code),
      },
      days: d.time.map((date, i) => ({
        date,
        code: d.weather_code[i],
        max: Math.round(d.temperature_2m_max[i]),
        min: Math.round(d.temperature_2m_min[i]),
        rain: d.precipitation_probability_max[i] ?? 0,
        ...describe(d.weather_code[i]),
      })),
      rainHint: rainHint(raw, today, nowHour),
    };
  } catch {
    return null;
  }
}
