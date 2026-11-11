import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NoZoom } from "@/components/NoZoom";
import { THEME_COOKIE, isTheme } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "toso one", template: "%s · toso one" },
  description: "Hub pessoal de ferramentas.",
  robots: { index: false, follow: false },
  appleWebApp: { title: "toso one", capable: true, statusBarStyle: "default" },
};

// Sem zoom: no iPhone o Safari amplia a página ao tocar num campo com letra
// menor que 16px; com a escala travada em 1 ele não amplia. O toque duplo e
// a pinça são barrados no CSS (touch-action) e em NoZoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body>
        <NoZoom />
        {children}
      </body>
    </html>
  );
}
