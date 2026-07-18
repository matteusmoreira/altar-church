# Segredos do Kids

O check-in exige dois segredos independentes no runtime Next.js:

- `KIDS_PIN_PEPPER`: protege o PIN de retirada com HMAC-SHA256.
- `KIDS_HEALTH_ENCRYPTION_KEY`: cifra detalhes clínicos com AES-256-GCM.

Gere cada valor separadamente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cadastre os valores no ambiente de hospedagem e em `.env.local`. Nunca versione valores reais. `KIDS_PIN_PEPPER` deve permanecer estável entre deploys; uma troca invalida PINs ativos e exige rotação das credenciais de retirada.

Antes de liberar check-in, confirme que o diagnóstico administrativo mostra `PIN configurado` e `Saúde configurada`.
