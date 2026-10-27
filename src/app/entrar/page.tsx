import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { getSession, safeNext } from "@/lib/auth";
import { convexConfigured, listPasskeys } from "@/lib/convex";
import { passwordConfigured } from "@/lib/password";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const next = safeNext((await searchParams).de);
  if (await getSession()) redirect(next);

  // O Face ID vira o botão principal assim que existir um aparelho cadastrado.
  let hasPasskeys = false;
  if (convexConfigured()) {
    try {
      hasPasskeys = (await listPasskeys()).length > 0;
    } catch {
      hasPasskeys = false;
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="mark">
          <LogoMark size={56} />
        </div>
        <h1>
          Bem-vindo <em>de volta</em>
        </h1>
        <p className="sub">Entre no toso one para abrir seus apps privados.</p>
        <LoginForm next={next} passkeyFirst={hasPasskeys} passwordReady={passwordConfigured()} />
      </div>
    </main>
  );
}
