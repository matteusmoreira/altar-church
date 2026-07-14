export const dashboardRoutes = {
  "admin": "/admin",
  "dashboard": "/dashboard",
  "attendance": "/presenca",
  "cells": "/celulas",
  "church-info": "/informacoes",
  "communication": "/comunicacao",
  "congregations": "/congregacoes",
  "content": "/conteudo",
  "crm": "/crm",
  "donations": "/doacao",
  "events": "/eventos",
  "finance": "/financeiro",
  "groups": "/gceus",
  "inpeace-play": "/inpeace-play",
  "members": "/pessoas",
  "ministries": "/ministerios",
  "notifications": "/notificacao",
  "prayer": "/intercessao",
  "programming": "/programacao",
  "reading-plans": "/discipulado",
  "reports": "/relatorios",
  "settings": "/configuracoes",
  "songs": "/louvor",
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
  "groups": "/groups",
  "members": "/members",
  "ministries": "/ministries",
  "notifications": "/notifications",
  "prayer": "/prayer",
  "programming": "/programming",
  "reading-plans": "/reading-plans",
  "reports": "/reports",
  "settings": "/settings",
  "songs": "/songs",
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

export const protectedDashboardPrefixes = [
  ...new Set([
    ...Object.values(dashboardRoutes),
    ...Object.values(legacyDashboardRoutes),
  ]),
]

export function isDashboardRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
