import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/http"
import { listCellHealth } from "@/lib/cells/health"

const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiAuth(request, { permission: "cells.view", sessionOnly: true })
    const rows = await listCellHealth(companyId)
    const csv = [
      ["Célula", "Saúde", "Membros ativos", "Capacidade", "Presença 7d", "Presença 30d", "Novos 30d", "Orações abertas", "Relatórios pendentes"],
      ...rows.map((row) => [row.name, row.health, row.activeMemberCount, row.capacity, row.attendance7, row.attendance30, row.newParticipants30, row.openPrayerCount, row.pendingReports30]),
    ].map((line) => line.map(cell).join(";")).join("\r\n")
    return new Response(`\uFEFF${csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=saude-celulas.csv" } })
  } catch (error) {
    return jsonError(error)
  }
}
