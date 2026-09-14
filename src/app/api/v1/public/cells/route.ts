import { NextResponse } from "next/server"
import { getPublicCellsData } from "@/lib/cells/public-cells"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug") || searchParams.get("church")

  if (!slug) {
    return NextResponse.json({ error: "Slug da igreja é obrigatório" }, { status: 400 })
  }

  const data = await getPublicCellsData(slug)
  if (!data) {
    return NextResponse.json({ error: "Igreja não encontrada" }, { status: 404 })
  }

  return NextResponse.json(data)
}
