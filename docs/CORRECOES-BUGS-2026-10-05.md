# Correções da revisão de bugs — 05/10/2026

## Escopo entregue

Os oito achados de `REVISAO-BUGS-2026-10-05.md` foram corrigidos. As alterações de Pessoas, follow-up, trilhas e opções de programação que já estavam no checkout foram preservadas e validadas em conjunto.

| Achado | Correção |
|---|---|
| Centavos multiplicados por 100 | Parser único para decimal canônico e formato brasileiro; mesma conversão na validação e persistência. |
| Voluntariado indisponível | Migration de `programming_kinds` e `programming_locations` aplicada no banco configurado. |
| Links públicos exigindo login | Exceções precisas para cadastro Kids e páginas públicas/inscrição/check-in de eventos; rotas internas continuam protegidas. |
| Financeiro gravado apesar de falha no comprovante | Upload antes da criação, lançamento e auditoria na mesma transação, limpeza do arquivo após rollback e `requestId` para repetição segura. Formulários preservam esse ID até sucesso. |
| Responsável de follow-up de outra igreja/inativo | Validação de UUID, igreja, atividade e exclusão antes de criar ou atualizar. |
| Leitura de Pessoas via API key sem sessão | Consulta interna com igreja previamente autorizada; a leitura das telas mantém o gate de sessão. |
| Arrays de API perdendo valores | Repetição de campos para dias da recorrência, objetivos e público; objetos estruturados continuam em JSON. |
| Participação em célula inferida sem presença | Linha do tempo exige presença individual registrada e reunião passada; elimina duplicação entre presença genérica e célula. |

Também foram corrigidos a ordem de locks nos cancelamentos de RSVP, o retorno 500 do portal de voluntário sem perfil ativo, o filtro “sem célula” com cast inválido, dependências de hooks, downloads por links nativos e avisos de lint. A saúde operacional passou a consultar últimos crons em lote e a contar tabelas por igreja sem produto cartesiano. O guard da prévia de Voluntariado agora funciona também sob `next start`, usando candidatos fictícios e bloqueando mutações.

## Banco

- Ambiente conferido: a conexão PostgreSQL corresponde ao projeto Supabase configurado, sem divulgar credenciais.
- Aplicadas `20261005120000_volunteer_programming_options` e `20261005130000_review_fk_indexes`.
- Conferência final: **88 migrations locais, 88 aplicadas, zero pendentes; zero FKs sem índice**.
- Novas colunas confirmadas em `volunteer_module_settings`.
- Runner de migrations usa lock dentro da transação e verifica novamente o carimbo sob lock. Checksum normaliza LF/CRLF e aceita hashes históricos de ambas as plataformas. O alerta antigo era exclusivamente diferença de quebra de linha; o SQL e os índices foram conferidos.

## Validação

- Node **24.20.0**, conforme `engines` do projeto.
- `npm test`: **364 passaram, 1 omitido**, zero falhas, incluindo 14 regressões desta correção.
- `typecheck`, `lint` e build passaram; lint com **zero erros e zero avisos**, build com 149 páginas.
- Playwright: **110 cenários distintos verificados; 3 omissões intencionais** (2 do chat do gestor e 1 de layout exclusivo do projeto mobile). A execução completa de 113 casos terminou com 109 aprovados e 4 omitidos, sem falhas; a omissão adicional de Ministério era uma verificação prematura da tela. Após substituir esse skip por espera explícita, a repetição dos quatro testes de Ministério e autenticação passou (5/5), cobrindo o caso antes omitido.
- Verificação real via API e banco na igreja marcada como teste: receitas, despesas e doações gravaram **10.50**, cada uma com **um único registro** após repetir a requisição. Registros e auditorias temporários removidos ao final; isso não representa pagamento real.
- API key temporária, sem cookies: Pessoas respondeu **200** e tentativa de outra igreja respondeu **403**; todos os resultados pertenciam à igreja autorizada. Chave removida ao final, segredo mantido somente em memória.
- Cadastro público Kids **200** sem cookies; links de eventos inválidos chegam à página pública/404 sem redirecionar para login. Kids interno mantém **307** para login.
- Voluntariado e APIs de Pessoas/portal responderam **200**. Saúde operacional respondeu **200**, em cerca de 10,4 s na amostra com chamadas a provedores externos.
- Scanner de segredos e `git diff --check` passaram. Sessões, credenciais e evidências locais são ignoradas no Git.

As evidências detalhadas permanecem localmente em `artifacts/fix-*`. Não foi comprovada entrega real de WhatsApp, e-mail, push, pagamentos nem funcionamento de cada provedor externo. O chat do gestor não é alcançável no workspace V2 atual, e seu E2E permanece explicitamente omitido; isso exige escopo próprio de produto. Commit/push não equivalem à aceitação em produção.
