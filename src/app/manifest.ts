import type { MetadataRoute } from "next"

// PWA instalável para portal, voluntariado e dashboard.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Altar Church",
    short_name: "Altar",
    description: "Gestão inteligente para sua igreja, incluindo o Portal da Família Kids.",
    start_url: "/",
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
        icons: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
