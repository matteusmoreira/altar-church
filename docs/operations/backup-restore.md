# Runbook — Backup e restore (Supabase)

Estado em 29/09/2026: PITR **não confirmado** neste projeto; `/api/ready` lia só
`BACKUP_LAST_RUN_AT` (sempre `unknown`). A partir desta mudança, o check de backup
lê `public.backup_runs` (heartbeat auditável) com fallback para a env.

## 1. Habilitar PITR (console Supabase, ~5 min)

1. Database → Backups → habilitar **Point-in-Time Recovery**.
2. Anotar: provedor = `supabase-pitr`, retenção contratada.
3. Criar o secret `BACKUP_HEARTBEAT_SECRET` (hex aleatório, 32 bytes) na Vercel
   e no `.env.local` — **nunca** commitar o valor.

## 2. Ensaio de restore (projeto isolado, obrigatório antes do GO)

1. Criar projeto Supabase isolado (free tier basta).
2. Restore do snapshot/PITR nele; rodar `scripts/verify-database.mjs` contra o restore.
3. Registrar o resultado: `provider`, `snapshot_id`, data, tempo de restore, quem executou.

## 3. Registrar o heartbeat (após cada backup verificado)

```bash
curl -X POST "$APP_URL/api/internal/ops/backup-heartbeat" \
  -H "x-backup-heartbeat-secret: $BACKUP_HEARTBEAT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"provider":"supabase-pitr","snapshotId":"...","status":"ok","detail":"restore ensaiado em 29/09/2026"}'
```

## 4. Verificar

- `GET /api/ready` → check `backup` = `healthy` com a data do heartbeat.
- `select * from public.backup_runs order by created_at desc limit 5;`
- Idade máxima: `BACKUP_MAX_AGE_HOURS` (default 36h); acima disso o check degrada.

## Agravante conhecido

`companies → CASCADE` apaga o tenant inteiro num erro operacional. Regra: nunca
rodar `delete from companies` fora de janela de manutenção com snapshot fresco.
