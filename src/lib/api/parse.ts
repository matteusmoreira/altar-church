import type { NextRequest } from "next/server"
import type { z } from "zod"
import { badRequest, validationError } from "@/lib/api/errors"

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema?: T,
): Promise<T extends z.ZodType ? z.infer<T> : unknown> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw badRequest("JSON inválido")
  }

  if (!schema) {
    return body as T extends z.ZodType ? z.infer<T> : unknown
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw validationError("Dados inválidos", parsed.error.flatten())
  }
  return parsed.data as T extends z.ZodType ? z.infer<T> : unknown
}

export function getSearchParam(request: NextRequest, key: string): string | undefined {
  const value = request.nextUrl.searchParams.get(key)?.trim()
  return value || undefined
}

export function getOptionalBoolean(request: NextRequest, key: string): boolean | undefined {
  const raw = request.nextUrl.searchParams.get(key)
  if (raw === null || raw === "") return undefined
  if (raw === "true" || raw === "1") return true
  if (raw === "false" || raw === "0") return false
  return undefined
}

export function getPageParams(request: NextRequest) {
  const pageRaw = request.nextUrl.searchParams.get("page")
  const pageSizeRaw =
    request.nextUrl.searchParams.get("pageSize") ?? request.nextUrl.searchParams.get("limit")
  const page = pageRaw ? Number(pageRaw) : undefined
  const pageSize = pageSizeRaw ? Number(pageSizeRaw) : undefined
  return {
    page: page && Number.isFinite(page) ? page : undefined,
    pageSize: pageSize && Number.isFinite(pageSize) ? pageSize : undefined,
  }
}
