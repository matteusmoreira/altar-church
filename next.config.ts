import type { NextConfig } from "next"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { legacyDashboardRedirects } from "./src/lib/navigation/routes"

const appRoot = dirname(fileURLToPath(import.meta.url))

const isProduction = process.env.NODE_ENV === "production"

/** Origem do Supabase, quando configurada, para liberar Storage e Realtime. */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
})()

const supabaseConnectSources = Array.from(
  new Set(["https://*.supabase.co", "wss://*.supabase.co", supabaseOrigin].filter((value): value is string => Boolean(value))),
)

/**
 * CSP pragmática: sem nonce por enquanto, o Next injeta scripts inline de
 * hidratação. Ainda assim bloqueia exfiltração (connect-src / img-src),
 * sequestro de <base>, formulários para domínios externos e plugins.
 *
 * QZ Tray (impressão de etiquetas do Kids) conecta por websocket local —
 * os endpoints abaixo são necessários para não quebrar a impressão.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseConnectSources.filter((s) => s.startsWith("https://")).join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseConnectSources.join(" ")} wss://localhost:8181 ws://localhost:8182`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS apenas em produção: em desenvolvimento (http://localhost) só causa ruído.
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
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
