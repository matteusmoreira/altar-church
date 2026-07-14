import { NextResponse } from "next/server"
import { toApiError } from "@/lib/api/errors"

export type ApiMeta = {
  total?: number
  page?: number
  pageSize?: number
  pageCount?: number
  [key: string]: unknown
}

export function jsonOk<T>(data: T, init?: { status?: number; meta?: ApiMeta }) {
  const body: { data: T; meta?: ApiMeta } = { data }
  if (init?.meta) {
    body.meta = init.meta
  }
  return NextResponse.json(body, { status: init?.status ?? 200 })
}

export function jsonError(error: unknown) {
  const apiError = toApiError(error)
  return NextResponse.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details !== undefined ? { details: apiError.details } : {}),
      },
    },
    { status: apiError.status },
  )
}
