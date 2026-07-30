# Portal do membro - pessoas autorizadas do Kids

## Objetivo

- Permitir editar e excluir pessoas autorizadas adicionadas pelo proprio membro.
- Permitir escolher foto da galeria do celular ao adicionar ou editar.
- Manter arquivos privados e impedir alteracao de vinculos/pessoas fora das criancas do membro.

## Validacao

- Testes focados do portal e fotos: aprovados (11/11).
- TypeScript, lint e build: aprovados.
- Suite completa: 164/165; falha antiga e fora do escopo em `p1-people-church.test.mjs`, que ainda procura o formato antigo `action: "person.save"` enquanto a auditoria atual grava `person.save` via SQL.
