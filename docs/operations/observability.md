# Observabilidade — uptime, dead letters, erros

Estado em 29/09/2026: Sentry instalado (`@sentry/nextjs`, no-op sem `SENTRY_DSN`);
alerta de dead letters em `POST /api/internal/ops/dead-letter-alert`.

## 1. Sentry (erros client + server)

1. Criar projeto Sentry (plano gratuito basta) e copiar o DSN.
2. Vercel → Environment Variables → `SENTRY_DSN` (todos os ambientes).
3. Deploy; gerar erro sintético (ex. rota de teste que lança) e confirmar no dashboard.
4. Sem DSN o SDK é no-op: dev local e E2E não enviam nada.

## 2. Uptime externo → /api/ready (obrigatório)

`/api/ready` retorna 200 `ready` ou 503 `not_ready` (5s cache). Configurar em
UptimeRobot/BetterStack (gratuito):

- Monitor HTTP(S) → `https://<dominio>/api/ready`, intervalo 5 min, alerta por e-mail/WhatsApp.
- Foi exatamente a ausência disso que fez o incidente do pooler (29/09) ser
  descoberto pelo usuário em vez de pelo time.

## 3. Dead letters → /api/internal/ops/dead-letter-alert (15 min)

```bash
curl -X POST "$APP_URL/api/internal/ops/dead-letter-alert" \
  -H "x-ops-alert-secret: $OPS_ALERT_SECRET"
```

- Secrets: `OPS_ALERT_SECRET` (hex aleatório) + `OPS_ALERT_EMAIL` (destino do alerta).
- Agendar a cada 15 min (pg_cron com pg_net, ou o próprio uptime monitor com cron).
- Responde `{ ok, dead: {integration, volunteer, kids, notifications}, alertSent }`;
  com zero dead letters não envia e-mail.
- `OPS_ALERT_EMAIL`/`RESEND_*` ausentes = `alertSent: false` com motivo (não falha).
