import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { FILE_BUCKET } from "@/lib/files/server"

type Context = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return new NextResponse("Arquivo não encontrado", { status: 404 })
    }

    const sql = getSql()
    const rows = await sql<{
      id: string
      bucket: string
      storage_path: string
      mime_type: string
      visibility: string
    }[]>`
      select id, bucket, storage_path, mime_type, visibility
      from public.app_files
      where id = ${id} and is_active = true and deleted_at is null
      limit 1
    `

    const file = rows[0]
    if (!file) {
      return new NextResponse("Arquivo não encontrado", { status: 404 })
    }

    const storage = createSupabaseAdminClient()
    if (!storage) {
      return new NextResponse("Serviço de arquivos temporariamente indisponível", { status: 503 })
    }

    const { data, error } = await storage.storage
      .from(file.bucket || FILE_BUCKET)
      .createSignedUrl(file.storage_path, 86400) // 24 horas

    if (error || !data?.signedUrl) {
      return new NextResponse("Erro ao gerar link do arquivo", { status: 500 })
    }

    return NextResponse.redirect(data.signedUrl, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    })
  } catch {
    return new NextResponse("Erro interno ao processar arquivo", { status: 500 })
  }
}
