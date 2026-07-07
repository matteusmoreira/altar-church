import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/server"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("companyId")
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ moduleIds: [] }, { status: 401 })
    }

    if (!companyId) {
      return NextResponse.json({ moduleIds: [] }, { status: 400 })
    }

    if (user.role !== "superadmin" && user.churchId !== companyId) {
      return NextResponse.json({ moduleIds: [] }, { status: 403 })
    }

    const moduleIds = await getCompanyEnabledModuleIds(companyId)

    return NextResponse.json({ moduleIds })
  } catch {
    return NextResponse.json({ moduleIds: [], error: "Erro inesperado" }, { status: 500 })
  }
}
