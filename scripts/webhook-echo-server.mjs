/**
 * Receptor local para testar webhooks do Altar Church.
 *
 *   node scripts/webhook-echo-server.mjs --secret=SEU_SECRET --port=8787
 *
 * Em Configurações → Integrações, use URL:
 *   http://localhost:8787/webhook
 * (NODE_ENV=development permite host local)
 */
import { createServer } from "node:http"
import { createHmac, timingSafeEqual } from "node:crypto"

function arg(name, fallback) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (flag) return flag.slice(name.length + 3)
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const secret = arg("secret", process.env.WEBHOOK_ECHO_SECRET || "")
const port = Number(arg("port", process.env.PORT || "8787"))

if (!secret || secret.length < 16) {
  console.error("Passe --secret=... (mesmo secret do endpoint no Altar Church)")
  process.exit(1)
}

function verify(timestamp, rawBody, signatureHeader) {
  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader || "")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method !== "POST" || !req.url?.startsWith("/webhook")) {
    res.writeHead(404)
    res.end("not found")
    return
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const rawBody = Buffer.concat(chunks).toString("utf8")

  const event = req.headers["x-altar-event"]
  const deliveryId = req.headers["x-altar-delivery-id"]
  const timestamp = String(req.headers["x-altar-timestamp"] || "")
  const signature = String(req.headers["x-altar-signature"] || "")

  const tsNum = Number(timestamp)
  const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum)
  const sigOk = verify(timestamp, rawBody, signature)

  console.log("\n--- webhook received ---")
  console.log("event:", event)
  console.log("deliveryId:", deliveryId)
  console.log("timestamp:", timestamp, skew > 300 ? `(skew ${skew}s HIGH)` : `(skew ${skew}s)`)
  console.log("signature valid:", sigOk)
  try {
    console.log("body:", JSON.stringify(JSON.parse(rawBody), null, 2))
  } catch {
    console.log("body (raw):", rawBody.slice(0, 500))
  }

  if (!sigOk) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "invalid signature" }))
    return
  }
  if (!Number.isFinite(tsNum) || skew > 300) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "timestamp skew" }))
    return
  }

  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ ok: true, deliveryId }))
})

server.listen(port, () => {
  console.log(`webhook echo on http://localhost:${port}/webhook`)
  console.log("Use this URL in Configurações → Integrações (dev).")
})
