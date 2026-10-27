"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APPS } from "@/lib/apps";
import { Icon, type IconName } from "./Icon";
import { LogoMark, Wordmark } from "./Logo";

export function TopBar({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const items: { href: string; label: string; icon: IconName; locked: boolean }[] = [
    { href: "/", label: "Início", icon: "home", locked: false },
    ...APPS.map((a) => ({ href: a.href, label: a.name, icon: a.icon, locked: a.private && !loggedIn })),
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="toso one — início">
        <LogoMark />
        <Wordmark />
      </Link>
      <nav className="nav" aria-label="Apps">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={isActive(it.href) ? "active" : undefined}>
            <Icon name={it.icon} size={15} />
            {it.label}
            {it.locked && (
              <span className="lk" aria-label="privado">
                <Icon name="lock" size={11} />
              </span>
            )}
          </Link>
        ))}
      </nav>
      {loggedIn ? (
        <Link className="session" href="/ajustes" aria-label="Ajustes e sessão">
          <span className="who">Ajustes</span>
          <span className="avatar">
            <Icon name="settings" size={13} />
          </span>
        </Link>
      ) : (
        <Link className="topbar-login" href={`/entrar?de=${encodeURIComponent(pathname)}`}>
          <Icon name="face" size={15} />
          Entrar
        </Link>
      )}
    </header>
  );
}
