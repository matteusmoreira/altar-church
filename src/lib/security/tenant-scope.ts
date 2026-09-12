export function assertCompanyScope(sessionCompanyId: string, resourceCompanyId: string | null | undefined) {
  if (!resourceCompanyId || resourceCompanyId !== sessionCompanyId) {
    throw new Error("Acesso negado")
  }
}
