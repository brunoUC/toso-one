import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EnablePasskeyButton } from "@/components/EnablePasskey";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { convexConfigured, listPasskeys, type StoredPasskey } from "@/lib/convex";
import { passwordConfigured } from "@/lib/password";
import { THEME_COOKIE } from "@/lib/theme";
import { RemovePasskey, SignOut, ThemePicker } from "./controls";

export const metadata: Metadata = { title: "Ajustes" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

export default async function AjustesPage() {
  const session = await requireSession("/ajustes");
  const convexOk = convexConfigured();
  let passkeys: StoredPasskey[] = [];
  let convexError: string | null = null;
  if (convexOk) {
    try {
      passkeys = await listPasskeys();
    } catch (err) {
      convexError = (err as Error).message;
    }
  }
  const expires = dateFmt.format(session.expiresAt * 1000);
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "grafite" ? "grafite" : "claro";

  return (
    <main className="page">
      <div className="settings">
        <h1>Ajustes</h1>

        <section className="card">
          <h2>
            <span className="ti">
              <Icon name="face" size={15} />
            </span>
            Face ID e passkeys
          </h2>
          <p className="card-sub">Cada aparelho cadastrado entra com um toque. Remova um aparelho perdido aqui.</p>
          {!convexOk ? (
            <p className="form-error">Convex não configurado: o Face ID fica indisponível até lá. A senha continua funcionando.</p>
          ) : convexError ? (
            <p className="form-error">Não foi possível falar com o Convex: {convexError}</p>
          ) : (
            <>
              {passkeys.length === 0 ? (
                <p className="form-note">Nenhum aparelho cadastrado ainda.</p>
              ) : (
                <ul className="keys">
                  {passkeys.map((p) => (
                    <li key={p.credentialId}>
                      <Icon name="key" size={16} />
                      <span className="grow">
                        {p.deviceName}
                        <span className="meta">
                          {" "}
                          · desde {dateFmt.format(p.createdAt)}
                          {p.lastUsedAt ? ` · último uso ${dateFmt.format(p.lastUsedAt)}` : ""}
                          {p.backedUp ? " · sincronizada" : ""}
                        </span>
                      </span>
                      <RemovePasskey credentialId={p.credentialId} deviceName={p.deviceName} />
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <EnablePasskeyButton label="Ativar Face ID neste aparelho" small />
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2>
            <span className="ti">
              <Icon name="palette" size={15} />
            </span>
            Tema
          </h2>
          <ThemePicker initial={theme} />
        </section>

        <section className="card">
          <h2>
            <span className="ti">
              <Icon name="lock" size={15} />
            </span>
            Sessão
          </h2>
          <dl className="kv">
            <dt>Entrou com</dt>
            <dd>{session.via === "passkey" ? "Face ID" : "Senha"} · {session.device}</dd>
            <dt>Expira em</dt>
            <dd>{expires}</dd>
            <dt>Banco (Convex)</dt>
            <dd>
              <span className={`status-dot${convexOk && !convexError ? "" : " off"}`} />
              {convexOk && !convexError ? "conectado" : "não configurado"}
            </dd>
            <dt>Senha de reserva</dt>
            <dd>
              <span className={`status-dot${passwordConfigured() ? "" : " off"}`} />
              {passwordConfigured() ? "configurada" : "ausente"}
            </dd>
          </dl>
          <SignOut />
        </section>
      </div>
    </main>
  );
}
