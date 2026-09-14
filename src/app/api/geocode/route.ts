import { NextResponse } from "next/server"

interface GeocodeResult {
  latitude: number
  longitude: number
  formattedAddress: string
  source: "mapbox" | "nominatim"
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim()
  const street = searchParams.get("street")?.trim()
  const number = searchParams.get("number")?.trim()
  const neighborhood = searchParams.get("neighborhood")?.trim()
  const city = searchParams.get("city")?.trim()
  const state = searchParams.get("state")?.trim()
  const postalCode = searchParams.get("postalCode")?.replace(/\D/g, "")

  // Build query string
  let query = q
  if (!query) {
    const parts = [
      street ? `${street}${number ? `, ${number}` : ""}` : "",
      neighborhood,
      city,
      state,
      postalCode ? `CEP ${postalCode}` : "",
      "Brasil",
    ].filter(Boolean)
    query = parts.join(", ")
  }

  if (!query) {
    return NextResponse.json({ error: "Endereço ou consulta não fornecidos" }, { status: 400 })
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

  // Try Mapbox Geocoding first if token is available
  if (mapboxToken) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        query,
      )}.json?access_token=${mapboxToken}&country=br&language=pt&limit=1`
      const res = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const data = await res.json()
        const feature = data.features?.[0]
        if (feature && Array.isArray(feature.center)) {
          const [lng, lat] = feature.center
          const result: GeocodeResult = {
            latitude: Number(lat),
            longitude: Number(lng),
            formattedAddress: feature.place_name || query,
            source: "mapbox",
          }
          return NextResponse.json(result)
        }
      }
    } catch {
      // Fall through to Nominatim
    }
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query,
    )}&countrycodes=br&limit=1`
    const res = await fetch(nominatimUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AltarChurch-Geocoding/1.0 (contato@altarchurch.com.br)",
      },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const list = await res.json()
      if (Array.isArray(list) && list.length > 0) {
        const item = list[0]
        const result: GeocodeResult = {
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
          formattedAddress: item.display_name || query,
          source: "nominatim",
        }
        return NextResponse.json(result)
      }
    }
  } catch {
    // Both failed
  }

  return NextResponse.json({ error: "Coordenadas não encontradas para o endereço informado" }, { status: 404 })
}
