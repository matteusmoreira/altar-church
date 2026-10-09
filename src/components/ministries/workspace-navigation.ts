"use client"

import { useSyncExternalStore } from "react"

const eventName = "ministry-workspace-navigation"
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener)
  window.addEventListener(eventName, listener)
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(eventName, listener) }
}
export function useWorkspaceNavigation(initialTab: string) {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "")
  const query = new URLSearchParams(search)
  function update(values: Record<string, string>, replace = false) {
    const url = new URL(window.location.href)
    for (const [key,value] of Object.entries(values)) {
      if (value) url.searchParams.set(key,value)
      else url.searchParams.delete(key)
    }
    window.history[replace ? "replaceState" : "pushState"](null,"",url)
    window.dispatchEvent(new Event(eventName))
  }
  const tab = query.get("tab") || initialTab
  const valid = ["visao-geral", "pessoas", "equipes", "agenda", "escalas", "comunicacao", "chat", "recursos", "relatorios", "configuracoes"].includes(tab)
  return { query, activeTab: valid ? tab : "visao-geral", update,
    navigate: (tab: string, filters: Record<string,string> = {}) => update({ tab, event: "", team: "", person: "", detail: "", task: "", scaleStatus: "", ...filters }) }
}
