import type { NextConfig } from "next"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { legacyDashboardRedirects } from "./src/lib/navigation/routes"

const appRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/voluntariado/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/celulas/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/kids/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/familia/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  async redirects() {
    return legacyDashboardRedirects
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  turbopack: {
    root: appRoot,
  },
}

export default nextConfig
