import type { NextConfig } from "next"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { legacyDashboardRedirects } from "./src/lib/navigation/routes"

const appRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  async redirects() {
    return legacyDashboardRedirects
  },
  experimental: {
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
