# Revisão do módulo Ministérios — 2026-08-11

## Objetivo

- Reproduzir e corrigir a criação de equipes que não reage ao clique.
- Revisar o módulo de Ministérios ponta a ponta: interface, ações de servidor, persistência, escopo por empresa/ministério, permissões e regressões.
- Validar por testes automatizados, typecheck, lint e build, preservando alterações locais não relacionadas.

## Estado

- Concluído localmente.

## Evidências e decisões

- Causa raiz: `@base-ui/react/button` define `type="button"` quando o tipo não é informado. O botão "Criar equipe" estava dentro de um formulário, mas não era `submit`; por isso o `onSubmit` e a ação de servidor nunca eram executados.
- O mesmo padrão atingia os 11 formulários do workspace. Todos agora declaram `type="submit"` explicitamente.
- As ações do workspace agora exibem erro também quando ocorre exceção de transporte/runtime, evitando falha silenciosa.
- A criação/edição administrativa de ministério agora revalida no servidor se o líder pertence à mesma igreja, está ativo e não foi removido.
- O fluxo de equipe mantém validação de permissão, empresa, ministério, membros ativos, capacidade, soft-delete e auditoria.
- Alterações locais não relacionadas em `src/components/ui/input.tsx`, migration de índice e teste correspondente foram preservadas.

## Validação final

- `npm test`: 243 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run lint -- --max-warnings=0`: aprovado.
- `npm run build`: aprovado, 150 páginas geradas.
- Playwright autenticado do módulo: 2/2 (desktop e mobile), incluindo o botão "Criar equipe" renderizado como `type="submit"`.
- Auditoria do banco: 148 tabelas; 0 índices inválidos; 0 índices duplicados; 0 FKs sem índice; 0 lacunas de RLS; 0 consultas longas.
- Nenhum deploy, commit ou push foi executado.
