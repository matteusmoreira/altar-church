import { toUazapiNumber } from "./phone"

export function buildPasswordResetUazapiPayload(input: {
  phone: string
  code: string
  requestId: string
}) {
  return {
    number: toUazapiNumber(input.phone),
    type: "button" as const,
    text: "Recebemos uma solicitação para redefinir sua senha no Altar Church. Toque no botão abaixo para copiar o código.",
    choices: [`Copiar código|copy:${input.code}`],
    footerText: "O código expira em 10 minutos. Não compartilhe com ninguém.",
    async: true,
    track_source: "altar_church_auth",
    track_id: input.requestId,
  }
}
