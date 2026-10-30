import type { MetadataRoute } from "next";

// Manifesto do app instalado (Tela de Início). No iPhone, as notificações só
// funcionam com o toso one aberto por lá.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "toso one",
    short_name: "toso one",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eceef1",
    theme_color: "#eceef1",
    icons: [{ src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
