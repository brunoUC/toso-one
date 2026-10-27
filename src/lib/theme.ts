export const THEME_COOKIE = "toso_tema";
export const THEMES = ["claro", "grafite"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}
