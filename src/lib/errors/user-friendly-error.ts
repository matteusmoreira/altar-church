import { ZodError } from "zod";

/**
 * Traduz e sanitiza erros técnicos (PostgreSQL, conexões, infraestrutura)
 * para mensagens claras, amigáveis e em português para o usuário final,
 * preservando mensagens de negócio intencionais.
 */
export function toUserFriendlyError(
  error: unknown,
  fallbackMessage = "Ocorreu um erro ao processar sua solicitação. Tente novamente."
): string {
  if (!error) return fallbackMessage;

  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Dados inválidos informados.";
  }

  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
      ? error.message
      : String(error);

  const trimmed = rawMessage.trim();
  if (!trimmed) return fallbackMessage;

  // 1. PostgreSQL: ON CONFLICT target mismatch (especificação incorreta de índice único)
  if (/no unique or exclusion constraint matching the ON CONFLICT specification/i.test(trimmed)) {
    return "Erro de sincronização ao registrar os dados. Por favor, tente novamente.";
  }

  // 2. PostgreSQL: Unique constraint violation (registro duplicado)
  if (/unique constraint|duplicate key value violates unique/i.test(trimmed)) {
    return "Este item já está cadastrado ou já foi adicionado anteriormente.";
  }

  // 3. PostgreSQL: Foreign key violation
  if (/violates foreign key constraint/i.test(trimmed)) {
    return "Não foi possível concluir a ação porque depende de outro registro que não foi encontrado ou foi excluído.";
  }

  // 4. PostgreSQL: Check constraint violation
  if (/violates check constraint/i.test(trimmed)) {
    return "Os dados informados não atendem aos critérios de validação do sistema.";
  }

  // 5. PostgreSQL: Not null violation
  if (/null value in column .* violates not-null constraint/i.test(trimmed)) {
    return "Um campo obrigatório não foi preenchido.";
  }

  // 6. PostgreSQL / DB schema errors
  if (/relation .* does not exist|column .* does not exist|syntax error at or near/i.test(trimmed)) {
    return "Erro interno de processamento no banco de dados. Contate o suporte se o problema persistir.";
  }

  // 7. Concorrência e bloqueio
  if (/deadlock detected|could not serialize access/i.test(trimmed)) {
    return "O sistema estava ocupado com outra operação simultânea. Por favor, tente novamente em instantes.";
  }

  // 8. Rede / Timeout / Conexão
  if (/connection refused|ECONNREFUSED|ETIMEDOUT|fetch failed|network timeout/i.test(trimmed)) {
    return "Falha na conexão com o servidor. Verifique sua conexão e tente novamente.";
  }

  // 9. Auth / Permissão
  if (trimmed === "Acesso negado" || trimmed === "Unauthorized" || trimmed === "Não autenticado") {
    return "Você não tem permissão para realizar esta ação.";
  }

  // 10. Se contiver termos puramente técnicos de SQL / banco de dados
  const isTechnical =
    /\b(pg_|sqlstate|select\b|insert\b|update\b|delete\b|syntax error|constraint|outbox)\b/i.test(
      trimmed
    );

  if (isTechnical) {
    return "Ocorreu um erro interno ao processar a operação. Tente novamente ou contate o suporte.";
  }

  // Mensagens já tratadas e amigáveis de regra de negócio
  return trimmed;
}
