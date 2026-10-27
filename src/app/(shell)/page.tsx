import { AppCard, NextAppCard } from "@/components/AppCard";
import { EnablePasskeyButton } from "@/components/EnablePasskey";
import { Icon, type IconName } from "@/components/Icon";
import { Circuit, RobotArm } from "@/components/RobotArm";
import { APPS } from "@/lib/apps";
import { getSession } from "@/lib/auth";
import { convexConfigured, recentEvents, type ActivityEvent } from "@/lib/convex";
import { dateEyebrow, greeting, relativeDay } from "@/lib/format";

const EVENT_LABEL: Record<string, { icon: IconName; text: (d: string) => string }> = {
  login_passkey: { icon: "face", text: (d) => `Entrada com Face ID · ${d}` },
  login_password: { icon: "key", text: (d) => `Entrada com senha · ${d}` },
  passkey_added: { icon: "check", text: (d) => `Face ID ativado · ${d}` },
  passkey_removed: { icon: "lock", text: (d) => `Face ID removido · ${d}` },
  password_locked: { icon: "lock", text: () => "Senha travada por 15 min após 5 erros" },
};

function Activity({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return <div className="activity empty">Nenhuma atividade ainda.</div>;
  return (
    <div className="activity">
      <ul>
        {events.map((e) => {
          const meta = EVENT_LABEL[e.kind] ?? { icon: "pulse" as IconName, text: (d: string) => d };
          return (
            <li key={`${e.kind}-${e.at}`}>
              <span className="ico navy">
                <Icon name={meta.icon} size={14} />
              </span>
              <span>{meta.text(e.detail)}</span>
              <time dateTime={new Date(e.at).toISOString()}>{relativeDay(e.at)}</time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default async function HubPage() {
  const session = await getSession();
  const events = session ? await recentEvents(5) : [];
  const privateCount = APPS.filter((a) => a.private).length;
  const daysLeft = session ? Math.max(0, Math.ceil((session.expiresAt * 1000 - Date.now()) / 86_400_000)) : null;

  return (
    <main className="page">
      <section className="hero-band rise">
        <Circuit className="circuit" />
        <RobotArm className="robot" />
        <p className="eyebrow">{dateEyebrow()}</p>
        <h1 className="display">
          {greeting()}
          <br />
          <em>Tudo em um lugar.</em>
        </h1>
        <div className="hero-stats">
          <div className="st">
            <span className="si">
              <Icon name="grid" />
            </span>
            <div>
              <span className="k">{APPS.length} apps</span>
              <span className="l">
                {APPS.length - privateCount} aberto · {privateCount} privado
              </span>
            </div>
          </div>
          <div className="st">
            <span className="si">
              <Icon name="clock" />
            </span>
            <div>
              <span className="k">05:13</span>
              <span className="l">coleta diária de voos</span>
            </div>
          </div>
          <div className="st">
            <span className="si">
              <Icon name={session ? "face" : "lock"} />
            </span>
            <div>
              <span className="k">{session ? `${daysLeft} dias` : "Fora"}</span>
              <span className="l">{session ? "até pedir login de novo" : "entre para ver os privados"}</span>
            </div>
          </div>
        </div>
      </section>

      {session?.via === "senha" && convexConfigured() && (
        <div className="notice">
          <span className="ic">
            <Icon name="face" size={18} />
          </span>
          <span className="grow">
            <b>Você entrou com senha.</b> Ative o Face ID neste {session.device} e da próxima vez é um toque.
          </span>
          <EnablePasskeyButton small />
        </div>
      )}

      <div className="section-title">
        <span className="ti">
          <Icon name="grid" />
        </span>
        <h2>Seus apps</h2>
        <span className="count">{String(APPS.length).padStart(2, "0")}</span>
      </div>
      <div className="apps rise">
        {APPS.map((app) => (
          <AppCard key={app.id} app={app} unlocked={Boolean(session)} />
        ))}
        <NextAppCard />
      </div>

      {session && convexConfigured() && (
        <>
          <div className="section-title">
            <span className="ti">
              <Icon name="pulse" size={18} />
            </span>
            <h2>Atividade</h2>
          </div>
          <Activity events={events} />
        </>
      )}
    </main>
  );
}
