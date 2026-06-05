# Testes E2E no Chrome

Este projeto usa Playwright com o navegador Google Chrome (`channel: "chrome"`). Por padrão, os testes abrem o Chrome visível; para rodar escondido, use `E2E_HEADLESS=1`.

## Contas

As contas ficam no arquivo local ignorado pelo git:

`docs/testing/e2e-accounts.local.md`

Os testes leem o bloco JSON desse doc. Não commitar esse arquivo porque ele contém senhas de teste.

Perfis atuais:

- `superadmin`: acesso ao console `/admin`.
- `admin`: acesso operacional da igreja `c1`.
- `member`: usuário comum mapeado para role técnica `reader`.

## Comandos

```bash
npm run e2e:setup
npm run test:e2e
```

## Regra para novos testes

1. Consultar `docs/testing/e2e-accounts.local.md`.
2. Importar `readE2EAccounts` em `tests/e2e/helpers/accounts`.
3. Usar `loginAs` em `tests/e2e/helpers/auth`.
4. Testar fluxos com usuário real logado no Chrome.
5. Cobrir primeiro smoke de rota, depois CRUD/validações conforme o módulo amadurecer.
