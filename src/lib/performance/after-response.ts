import { after } from "next/server"

/**
 * Agenda trabalho best-effort depois da resposta HTTP, sem aumentar a latência
 * percebida de Server Actions e Route Handlers.
 */
export function afterResponse(label: string, task: () => Promise<unknown>) {
  try {
    after(async () => {
      try {
        await task()
      } catch (error) {
        console.error(`[after-response] ${label} failed`, error)
      }
    })
  } catch (error) {
    // Chamadas fora de um request (scripts/testes) continuam seguras; workers
    // persistentes processam qualquer item já gravado no outbox.
    console.error(`[after-response] ${label} was not scheduled`, error)
  }
}
