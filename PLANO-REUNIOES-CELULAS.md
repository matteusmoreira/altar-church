# Reuniões dentro de Células

## Objetivo

Permitir que administrador, supervisor e líder criem reuniões diretamente no painel operacional de Células, sempre limitados às células que podem gerenciar.

## Mudanças

- Criar botão visível `Nova reunião` em `Operação avançada de Células`.
- Salvar reunião agendada com célula, título, início, fim opcional, estudo opcional, local e observações.
- Liberar `cells.meeting.manage` para líder de célula; `requireManagedCell` mantém escopo somente nas próprias células.
- Manter relatório histórico existente sem depender dele para agendar nova reunião.
- Validar testes focados, tipos, lint e build.

## Gate

- Local: código e testes passando.
- Produção: depende de deploy e teste autenticado após autorização separada.
