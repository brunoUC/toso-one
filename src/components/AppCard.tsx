import Link from "next/link";
import type { AppEntry } from "@/lib/apps";
import { Icon } from "./Icon";

function Badge({ app, unlocked }: { app: AppEntry; unlocked: boolean }) {
  if (app.private && !unlocked) {
    return (
      <span className="badge locked">
        <Icon name="lock" size={10} />
        privado
      </span>
    );
  }
  if (app.status === "live") {
    return (
      <span className="badge">
        <span className="dot" />
        ao vivo
      </span>
    );
  }
  return <span className="badge">{app.status === "beta" ? "beta" : "em breve"}</span>;
}

export type FlightHighlight = { label: string; route: string; price: string; trip: string } | null;

function FlightArc() {
  return (
    <>
      <svg className="arc" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
        <path d="M14 52 C 90 -8, 210 -8, 286 34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 5" strokeLinecap="round" opacity=".9" vectorEffect="non-scaling-stroke" />
        <path d="M14 52 C 100 10, 200 10, 286 52" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 5" strokeLinecap="round" opacity=".45" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="arc-labels">
        <span>Brasil</span>
        <span>Europa</span>
      </div>
    </>
  );
}

export function AppCard({ app, unlocked, flight }: { app: AppEntry; unlocked: boolean; flight?: FlightHighlight }) {
  const locked = app.private && !unlocked;
  const href = locked ? `/entrar?de=${encodeURIComponent(app.href)}` : app.href;

  return (
    <Link className={`app${locked ? " blurred" : ""}`} data-tone={app.tone} href={href}>
      <div className="app-head">
        <div className="app-icon">
          <Icon name={app.icon} size={20} />
        </div>
        <Badge app={app} unlocked={unlocked} />
      </div>
      <div className="app-name">{app.name}</div>
      <div className="app-desc">{app.description}</div>

      {app.id === "voos" && <FlightArc />}
      {app.id === "voos" && flight && (
        <div className="app-flight">
          <span className="eyebrow" style={{ margin: 0 }}>{flight.label}</span>
          <div>
            <b>{flight.route}</b> · {flight.price}
          </div>
          <span className="app-flight-trip">{flight.trip}</span>
        </div>
      )}

      <div className="app-body">
        {locked ? (
          <div className="veil" aria-hidden="true">
            <svg width="100%" height="60" viewBox="0 0 300 60" preserveAspectRatio="none">
              <path d="M0 50 C40 44 60 48 90 38 S150 34 180 24 S250 16 300 6" fill="none" stroke="var(--tone)" strokeWidth="2.5" />
            </svg>
          </div>
        ) : (
          <>
            {app.id === "financas" && (
              <div className="app-preview" aria-hidden="true">
                <svg width="100%" height="56" viewBox="0 0 300 56" preserveAspectRatio="none">
                  <path d="M0 48 C40 42 60 46 90 36 S150 32 180 22 S250 14 300 4" fill="none" stroke="var(--tone)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="note">prévia · dados de exemplo</span>
              </div>
            )}
            <span className="app-cta">
              Abrir <Icon name="arrow" size={14} />
            </span>
          </>
        )}
      </div>

      {locked && (
        <div className="unlock">
          <span>
            <b>Bloqueado</b> · entre para abrir
          </span>
          <span className="go">
            <Icon name="arrow" size={14} />
          </span>
        </div>
      )}
    </Link>
  );
}

export function NextAppCard() {
  return (
    <div className="app add" data-tone="sand">
      <div className="plus">
        <Icon name="cpu" size={20} />
      </div>
      <div className="app-name">Próximo app</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
        Cada app novo é uma entrada em <code style={{ fontFamily: "var(--mono)" }}>src/lib/apps.ts</code>
      </div>
    </div>
  );
}
