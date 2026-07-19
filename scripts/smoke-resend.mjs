const from = process.env.RESEND_FROM_EMAIL
const apiKey = process.env.RESEND_API_KEY

if (!from || !apiKey) {
  console.error("RESEND_FROM_EMAIL e RESEND_API_KEY são obrigatórios")
  process.exit(1)
}

const recipient = from.match(/<([^>]+)>/)?.[1] ?? from
const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [recipient],
    subject: "Altar Church - smoke de produção",
    text: `Smoke de produção concluído em ${new Date().toISOString()}.`,
  }),
})
const body = await response.json().catch(() => ({}))

console.log(
  JSON.stringify({
    status: response.status,
    accepted: response.ok,
    id: body.id ?? null,
    error: body.message ?? null,
  }),
)

if (!response.ok) process.exit(1)
