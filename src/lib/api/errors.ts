import { ZodError } from "zod"

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL"

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export function unauthorized(message = "Não autenticado") {
  return new ApiError(401, "UNAUTHORIZED", message)
}

export function forbidden(message = "Acesso negado") {
  return new ApiError(403, "FORBIDDEN", message)
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, "BAD_REQUEST", message, details)
}

export function notFound(message = "Não encontrado") {
  return new ApiError(404, "NOT_FOUND", message)
}

export function validationError(message: string, details?: unknown) {
  return new ApiError(422, "VALIDATION_ERROR", message, details)
}

/** Map known domain/auth errors and Zod into ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }

  if (error instanceof ZodError) {
    return validationError("Dados inválidos", error.flatten())
  }

  if (error instanceof Error) {
    const message = error.message

    if (message === "Acesso negado") {
      return forbidden(message)
    }
    if (message === "Não autenticado" || message === "Unauthorized") {
      return unauthorized(message)
    }
    if (message === "Igreja obrigatória") {
      return badRequest(message)
    }
    if (/não encontrad/i.test(message) || /not found/i.test(message)) {
      return notFound(message)
    }

    // Action-style soft errors often use plain Error with user-facing text
    if (
      /obrigatór/i.test(message) ||
      /inválid/i.test(message) ||
      /mínimo/i.test(message) ||
      /selecione/i.test(message) ||
      /informe/i.test(message)
    ) {
      return badRequest(message)
    }

    return new ApiError(
      500,
      "INTERNAL",
      process.env.NODE_ENV === "production" ? "Erro inesperado" : message,
    )
  }

  return new ApiError(500, "INTERNAL", "Erro inesperado")
}
