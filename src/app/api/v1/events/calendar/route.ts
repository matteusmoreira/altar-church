import type { NextRequest } from "next/server"
import { listEvents, normalizeEventFilters } from "@/lib/operational/data"
export async function GET(request: NextRequest) {
  try {
    const values = Object.fromEntries(request.nextUrl.searchParams)
    const filters = normalizeEventFilters(values as Parameters<typeof normalizeEventFilters>[0])
    if (!filters.from || !filters.to || Date.parse(filters.to) < Date.parse(filters.from) || Date.parse(filters.to) - Date.parse(filters.from) > 42 * 86400000) return Response.json({ error: "Selecione um período de até 42 dias" }, { status: 400 })
    const first = await listEvents(filters)
    const events = [...first.events]
    for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) events.push(...(await listEvents(filters, undefined, page)).events)
    return Response.json({ events }, { headers: { "Cache-Control": "private, no-store" } })
  } catch { return Response.json({ error: "Não foi possível carregar o calendário" }, { status: 403 }) }
}
