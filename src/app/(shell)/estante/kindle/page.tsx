import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { KindleReceiver } from "./KindleReceiver";

export const metadata: Metadata = { title: "Kindle" };

// Aba aberta pelo favorito "Enviar ao toso one" na página de anotações da
// Amazon: recebe os highlights por postMessage e grava na Estante.
export default async function KindlePage() {
  await requireSession("/estante/kindle");
  return (
    <main className="page estante">
      <p className="eyebrow">Estante · Kindle</p>
      <h1 className="page-h1">Highlights da Amazon</h1>
      <KindleReceiver />
    </main>
  );
}
