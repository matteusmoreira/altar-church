# Voluntariado 2.0 — operação

## Rollout

1. `npm run db:migrate`
2. `node --env-file-if-exists=.env.local scripts/verify-volunteer-v2-rls.mjs`
3. `npm run db:audit && npm run db:optimize`
4. Configurar secrets da Edge Function.
5. Configurar o limite Uazapi em cada plano e conectar ao menos uma instância na igreja piloto.
6. Publicar `volunteer-delivery-worker`.
7. Validar push, Uazapi e Resend com destinatários de teste.
8. Publicar aplicação e fazer smoke desktop/mobile.
9. Somente então definir `volunteer_module_settings.v2_enabled = true` por igreja.

O rollout é aditivo. A flag nasce desligada. Não ativar se um canal real, RLS ou fluxo completo falhar.

## Secrets do worker

- `VOLUNTEER_WORKER_SECRET`
- `UAZAPI_BASE_URL` e `UAZAPI_ADMIN_TOKEN` no runtime Next.js, para o painel criar instâncias.
- Tokens de instância ficam por igreja no Supabase Vault; nunca em env global.
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

O token usado para deploy precisa de permissão de Owner/Developer para Edge Functions e Edge Function Secrets no projeto Supabase.

## Agendamento

Invocar `volunteer-delivery-worker` a cada minuto com `Authorization: Bearer <VOLUNTEER_WORKER_SECRET>`. O worker chama `prepare_volunteer_delivery()`, cria lembretes idempotentes conforme `reminder_hours`, marca faltas vencidas e processa a outbox.

Push inválido com HTTP 404/410 desativa a inscrição. Confirmação, troca e check-in não funcionam offline.

## Verificação

```powershell
npm run lint -- --max-warnings=0
npm run typecheck
npm test
npm run build
node --env-file-if-exists=.env.local scripts/verify-volunteer-v2-rls.mjs
npm run db:audit
```

O único gap RLS tolerado atualmente é `healthcheck`, fora do módulo. Voluntariado deve ter zero gaps, índices inválidos e índices duplicados.
