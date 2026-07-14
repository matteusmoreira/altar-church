import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const path = join(process.cwd(), "docs", "api", "openapi.yaml")
    const yaml = readFileSync(path, "utf8")
    return new NextResponse(yaml, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    })
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "OpenAPI não disponível" } },
      { status: 500 },
    )
  }
}
