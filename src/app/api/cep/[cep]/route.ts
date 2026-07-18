export async function GET(_request: Request, { params }: { params: Promise<{ cep: string }> }) {
  const digits = (await params).cep.replace(/\D/g, "")
  if (!/^\d{8}$/.test(digits)) return Response.json({ error: "CEP inválido" }, { status: 400 })

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return Response.json({ error: "Consulta de CEP indisponível" }, { status: 502 })
    const data = await response.json() as Record<string, unknown>
    if (data.erro === true || data.erro === "true") return Response.json({ error: "CEP não encontrado" }, { status: 404 })
    return Response.json({
      postalCode: String(data.cep ?? ""),
      street: String(data.logradouro ?? ""),
      neighborhood: String(data.bairro ?? ""),
      city: String(data.localidade ?? ""),
      state: String(data.uf ?? ""),
    })
  } catch {
    return Response.json({ error: "Consulta de CEP indisponível" }, { status: 502 })
  }
}

