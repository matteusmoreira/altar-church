# Design: Convite de acesso a partir de Pessoas

Data: 2026-07-14

## Problema

Criar uma pessoa em `/pessoas` grava apenas cadastro pastoral (`people`). Não cria login. Não há senha padrão.

## Solução

Admin/pastor convida acesso com:

- checkbox no formulário de pessoa **ou** botão no detalhe
- role escolhida no convite
- senha temporária digitada pelo admin (mín. 8)

## Dados

- `people.profile_id` → `profiles.id` (nullable, único quando preenchido)
- Status de acesso derivado: `hasSystemAccess = profile_id IS NOT NULL`

## Regras

1. Só `superadmin`, `admin`, `pastor`
2. E-mail obrigatório
3. Cria/atualiza Auth com senha + `profiles` + vínculo `people.profile_id`
4. E-mail de outra igreja → erro
5. Senha **não** vai para audit metadata
6. Sem e-mail SMTP neste MVP

## UI

- Form: switch + role + senha
- Lista: badge "Com acesso"
- Detalhe: card Acesso + dialog convidar/redefinir

## Fora de escopo

- Force password change no 1º login
- Convite por e-mail SMTP
- Role `superadmin` via Pessoas
