import type { MetadataRoute } from "next"

// PWA instalável (portal da família e dashboard). Sem service worker:
// dados sensíveis nunca ficam em cache persistente no dispositivo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Altar Church",
    short_name: "Altar",
    description: "Gestão inteligente para sua igreja, incluindo o Portal da Família Kids.",
    start_url: "/voluntariado",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["productivity", "lifestyle"],
    shortcuts: [
      {
        name: "Minha escala",
        short_name: "Escala",
        url: "/voluntariado",
        icons: [{ src: "/icons/logo.png", sizes: "512x512" }],
      },
    ],
    icons: [
      {
        src: "/icons/logo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
