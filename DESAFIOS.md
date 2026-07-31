# Desafios conhecidos

- E2E pode travar ao reutilizar um servidor `next dev` antigo durante recompilação de rota. Para prova confiável, usar `next start` novo em porta isolada e limpar o processo ao final.

- PowerShell desta máquina pode exibir arquivos UTF-8 como mojibake quando `Get-Content` é usado sem `-Encoding utf8`. Usar leitura UTF-8 explícita antes de diagnosticar ou editar texto em português.
