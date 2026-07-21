const SLOW_ACTION_MS = 1_500
const CRITICAL_ACTION_MS = 5_000

type ActionOutcome = "ok" | "error"

/** Mede Server Actions sem alterar seu contrato de retorno. */
export async function withActionTiming<T>(name: string, task: () => Promise<T>): Promise<T> {
  const startedAt = performance.now()
  let outcome: ActionOutcome = "ok"

  try {
    const result = await task()
    if (result && typeof result === "object" && "ok" in result && result.ok === false) {
      outcome = "error"
    }
    return result
  } catch (error) {
    outcome = "error"
    throw error
  } finally {
    const durationMs = Math.round(performance.now() - startedAt)
    const payload = { type: "server_action_timing", name, durationMs, outcome }

    if (durationMs >= CRITICAL_ACTION_MS) {
      console.error("[performance] critical action", payload)
    } else if (durationMs >= SLOW_ACTION_MS) {
      console.warn("[performance] slow action", payload)
    }
  }
}
