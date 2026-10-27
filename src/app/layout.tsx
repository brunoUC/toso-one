import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: { default: "toso one", template: "%s · toso one" },
  description: "Hub pessoal de ferramentas.",
  robots: { index: false, follow: false },
  appleWebApp: { title: "toso one", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceef1" },
    { media: "(prefers-color-scheme: dark)", color: "#18191c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O tema vem de um cookie para o servidor já renderizar certo, sem piscar.
  const tema = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html
      lang="pt-BR"
      data-theme={isTheme(tema) && tema === "grafite" ? "grafite" : undefined}
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
