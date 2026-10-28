import Link from "next/link";

const TABS = [
  { href: "/financas", label: "Painel" },
  { href: "/financas/extrato", label: "Extrato" },
  { href: "/financas/regras", label: "Categorias e regras" },
];

export function FinNav({ active }: { active: string }) {
  return (
    <nav className="seg fin-nav" aria-label="Finanças">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
