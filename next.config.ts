import type { NextConfig } from "next"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
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
