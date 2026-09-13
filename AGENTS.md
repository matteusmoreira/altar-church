# AGENTS.md — Regras e Diretrizes do Projeto

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## AUTO-APRENDIZADO

Ao final de toda sessão, capture todos os desafios e pontos de fricção que você encontrou que podem ocorrer novamente no futuro.

Se é algo que pode ser corrigido, corrija.

Se não é algo que pode ser corrigido, coloque essa informação no arquivo DESAFIOS.md

Se o aprendizado se refere a uma Skill, modifique a skill ao invés de gravar o desafio.

Leia o DESAFIOS.md desse projeto ao iniciar uma nova sessão.


## DECISÕES MUITO TÉCNICAS

Toda vez que eu precisar tomar uma decisão técnica (escolha de stack, bibliotecas, padrões de código, segurança, manutenibilidade), me ofereça os prós e contras de cada opção.

E a sua recomendação baseada em critérios técnicos, de DRY e código limpo.

## TRABALHO DE PEÃO

Nunca me peça para rodar comandos no terminal ou manipular arquivos diretamente, se é algo que você pode fazer.

## AÇÕES PENDENTES

Tudo que depende da minha decisão vai no final, num bloco separado:

=== ⚠️ PENDENTE: ===
<confirmação / decisão / escolha, com sua recomendação em uma linha>

## FINALIZAR SESSÃO

Ao finalizar uma sessão, quando não tiver mais nada pendente e mais nada a ser feito, coloque ao final da resposta:
=== ✅ SESSÃO FINALIZADA ===
