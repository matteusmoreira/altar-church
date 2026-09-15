import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { toUserFriendlyError } from "../src/lib/errors/user-friendly-error.ts";

test("traduz erro de ON CONFLICT do PostgreSQL para mensagem amigável", () => {
  const error = new Error("there is no unique or exclusion constraint matching the ON CONFLICT specification");
  assert.equal(
    toUserFriendlyError(error),
    "Erro de sincronização ao registrar os dados. Por favor, tente novamente."
  );
});

test("traduz erro de chave duplicada (unique constraint)", () => {
  const error = new Error('duplicate key value violates unique constraint "volunteer_assignments_shift_volunteer_unique"');
  assert.equal(
    toUserFriendlyError(error),
    "Este item já está cadastrado ou já foi adicionado anteriormente."
  );
});

test("traduz erro de chave estrangeira (foreign key)", () => {
  const error = new Error('insert or update on table "volunteer_shifts" violates foreign key constraint "volunteer_shifts_event_id_fkey"');
  assert.equal(
    toUserFriendlyError(error),
    "Não foi possível concluir a ação porque depende de outro registro que não foi encontrado ou foi excluído."
  );
});

test("traduz erro de campo não nulo (not-null constraint)", () => {
  const error = new Error('null value in column "name" violates not-null constraint');
  assert.equal(
    toUserFriendlyError(error),
    "Um campo obrigatório não foi preenchido."
  );
});

test("traduz erro de validação Zod", () => {
  const schema = z.object({ title: z.string().min(3, "O título precisa ter no mínimo 3 caracteres") });
  const result = schema.safeParse({ title: "oi" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      toUserFriendlyError(result.error),
      "O título precisa ter no mínimo 3 caracteres"
    );
  }
});

test("preserva mensagens de regra de negócio legíveis em português", () => {
  const error = new Error("Preencha todas as vagas antes de publicar: Louvor (1)");
  assert.equal(
    toUserFriendlyError(error),
    "Preencha todas as vagas antes de publicar: Louvor (1)"
  );
});

test("substitui mensagens com SQL por mensagem amigável genérica", () => {
  const error = new Error('syntax error at or near "SELECT" in volunteer_delivery_outbox');
  assert.equal(
    toUserFriendlyError(error),
    "Erro interno de processamento no banco de dados. Contate o suporte se o problema persistir."
  );
});
