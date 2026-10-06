export const dashboardRoutes = {
  "automations": "/automacoes",
  "admin": "/admin",
  "dashboard": "/dashboard",
  "attendance": "/presenca",
  "cells": "/celulas",
  "church-info": "/informacoes",
  "communication": "/comunicacao",
  "congregations": "/congregacoes",
  "content": "/conteudo",
  "crm": "/crm",
  "forms": "/formularios",
  "donations": "/doacao",
  "events": "/eventos",
  "finance": "/financeiro",
  "kids": "/kids",
  "members": "/pessoas",
  "ministries": "/ministerios",
  "notifications": "/notificacao",
  "prayer": "/intercessao",
  "programming": "/programacao",
  "reading-plans": "/discipulado",
  "reports": "/relatorios",
  "settings": "/configuracoes",
  "visitors": "/visitantes",
  "volunteers": "/voluntariado",
} as const

export type DashboardRouteId = keyof typeof dashboardRoutes

export const legacyDashboardRoutes = {
  "attendance": "/attendance",
  "cells": "/cells",
  "church-info": "/church-info",
  "communication": "/communication",
  "congregations": "/congregations",
  "content": "/content",
  "donations": "/donations",
  "events": "/events",
  "finance": "/finance",
  "members": "/members",
  "ministries": "/ministries",
  "notifications": "/notifications",
  "prayer": "/prayer",
  "programming": "/programming",
  "reading-plans": "/reading-plans",
  "reports": "/reports",
  "settings": "/settings",
  "visitors": "/visitors",
  "volunteers": "/volunteers",
} as const satisfies Partial<Record<DashboardRouteId, string>>

export const legacyDashboardRedirects = Object.entries(legacyDashboardRoutes).map(
  ([moduleId, source]) => ({
    source: `${source}/:path*`,
    destination: `${dashboardRoutes[moduleId as keyof typeof legacyDashboardRoutes]}/:path*`,
    permanent: true,
  })
)

legacyDashboardRedirects.push(
  { source: "/gceus/:path*", destination: "/celulas/:path*", permanent: true },
  { source: "/groups/:path*", destination: "/celulas/:path*", permanent: true },
)

export const protectedDashboardPrefixes = [
  "/membro",
  ...new Set([
    ...Object.values(dashboardRoutes),
    ...Object.values(legacyDashboardRoutes),
  ]),
]

export function isProtectedDashboardPath(pathname: string) {
  const legacyEventChild = /^\/eventos\/publico\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(pathname)
  const publicPath = /^\/kids\/cadastro\/[a-z0-9-]+\/?$/.test(pathname)
    || (!legacyEventChild && /^\/eventos\/publico\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(pathname))
    || /^\/eventos\/(?:publico|inscricao|check-in(?:\/sessao)?)\/[0-9a-f-]{36}\/?$/i.test(pathname)
  return !publicPath && protectedDashboardPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function isDashboardRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export type RouteSearchParams = Record<string, string | string[] | undefined>

export function canonicalEntityPath(prefix: string, slug: string, query: RouteSearchParams = {}) {
  const params = new URLSearchParams()
  for (const [key, values] of Object.entries(query)) {
    for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) params.append(key, value)
  }
  const search = params.toString()
  return `${prefix}/${slug}${search ? `?${search}` : ""}`
}
