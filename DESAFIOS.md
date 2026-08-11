# Desafios conhecidos

- A validacao SQL local depende dos containers do Supabase; sem o container `supabase_db_altar-church`, `supabase status` nao consegue validar a migration. Manter a prova local de codigo separada da aplicacao da migration em staging/producao.

- E2E pode travar ao reutilizar um servidor `next dev` antigo durante recompilação de rota. Para prova confiável, usar `next start` novo em porta isolada e limpar o processo ao final.

- PowerShell desta máquina pode exibir arquivos UTF-8 como mojibake quando `Get-Content` é usado sem `-Encoding utf8`. Usar leitura UTF-8 explícita antes de diagnosticar ou editar texto em português.

- A Supabase CLI 2.113.0 rejeita tokens versionados no formato `sbp_v0_...`; para operações de banco, usar conexão PostgreSQL SSL direta com a senha fornecida ou solicitar um PAT no formato `sbp_...`, sem persistir credenciais no projeto.
