// Registro dos apps do hub. Um app novo é uma entrada aqui mais a sua pasta
// em src/app/<href>. `private: true` coloca o app atrás do login — o proxy e
// a própria página conferem a sessão.

export type Tone = "sky" | "emerald" | "sand" | "violet";

export type AppEntry = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: "plane" | "chart" | "cpu";
  tone: Tone;
  private: boolean;
  status: "live" | "beta" | "soon";
};

export const APPS: AppEntry[] = [
  {
    id: "voos",
    name: "Voos",
    description: "Tarifas em executiva, Brasil → Europa",
    href: "/voos",
    icon: "plane",
    tone: "sky",
    private: false,
    status: "live",
  },
  {
    id: "financas",
    name: "Finanças",
    description: "Patrimônio, metas e carteira",
    href: "/financas",
    icon: "chart",
    tone: "emerald",
    private: true,
    status: "beta",
  },
];

// Rotas que não são apps mas também exigem sessão.
const PRIVATE_EXTRA = ["/ajustes"];

export const PRIVATE_PREFIXES = [
  ...APPS.filter((a) => a.private).map((a) => a.href),
  ...PRIVATE_EXTRA,
];

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
