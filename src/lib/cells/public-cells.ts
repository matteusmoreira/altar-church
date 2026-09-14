import { getSql } from "@/lib/db/client"

export interface PublicCellCategory {
  id: string
  name: string
  color: string
}

export interface PublicCellItem {
  id: string
  name: string
  description: string
  categoryId: string | null
  categoryName: string
  categoryColor: string
  meetingDay: string
  meetingTime: string | null
  meetingLocation: string
  neighborhood: string
  city: string
  state: string
  postalCode: string
  isAddressPublic: boolean
  displayAddress: string
  latitude: number | null
  longitude: number | null
  maxCapacity: number
  minAge: number | null
  maxAge: number | null
  acceptsRequests: boolean
  leaderName: string | null
  leaderPhone: string | null
  cellPhotoUrl: string | null
  meetsToday: boolean
}

export interface PublicCellsPageData {
  church: {
    id: string
    name: string
    publicName: string
    slug: string
    phone: string
    email: string
    city: string
    state: string
    address: string
  }
  cells: PublicCellItem[]
  categories: PublicCellCategory[]
  centerCoordinates: {
    latitude: number
    longitude: number
  }
}

interface ChurchSlugRow {
  id: string
  name: string
  public_name: string | null
  slug: string
  phone: string
  email: string
  city: string
  state: string
  address: string
}

interface RawPublicCellRow {
  id: string
  name: string
  description: string
  category_id: string | null
  category_name: string | null
  meeting_day: string
  meeting_time: string | null
  meeting_location: string
  address_number: string
  address_complement: string
  neighborhood: string
  city: string
  state: string
  postal_code: string
  is_address_public: boolean | null
  latitude: number | null
  longitude: number | null
  max_capacity: number
  min_age: number | null
  max_age: number | null
  accepts_requests: boolean
  leader_name: string | null
  leader_phone: string | null
  cell_photo_url: string | null
}

const CATEGORY_COLORS = [
  "#f97316", // Orange (Jovens)
  "#8b5cf6", // Violet (Casais)
  "#10b981", // Emerald (Família)
  "#3b82f6", // Blue (Homens / Geral)
  "#ec4899", // Pink (Mulheres)
  "#eab308", // Yellow (Teens)
  "#06b6d4", // Cyan
  "#6366f1", // Indigo
]

function getCategoryColor(name: string, index: number): string {
  const lower = name.toLowerCase()
  if (lower.includes("jovem") || lower.includes("juventude")) return "#f97316"
  if (lower.includes("casal") || lower.includes("casais") || lower.includes("família")) return "#8b5cf6"
  if (lower.includes("mulher") || lower.includes("feminino")) return "#ec4899"
  if (lower.includes("homem") || lower.includes("masculino")) return "#3b82f6"
  if (lower.includes("teen") || lower.includes("adolescente") || lower.includes("kids")) return "#eab308"
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}

const WEEKDAY_NAMES_PT = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
]

function checkMeetsToday(meetingDay: string): boolean {
  if (!meetingDay) return false
  const dayIndex = new Date().getDay()
  const todayPt = WEEKDAY_NAMES_PT[dayIndex]
  const normalized = meetingDay.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const todayNormalized = todayPt.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return normalized.includes(todayNormalized)
}

export async function getPublicCellsData(slug: string): Promise<PublicCellsPageData | null> {
  const sql = getSql()

  const churchRows = await sql<ChurchSlugRow[]>`
    select id, name, public_name, slug, phone, email, city, state, address
    from public.companies
    where slug = ${slug}
      and active = true
      and status = 'active'
    limit 1
  `

  const church = churchRows[0]
  if (!church) return null

  const cellRows = await sql<RawPublicCellRow[]>`
    select
      g.id,
      g.name,
      g.description,
      g.category_id,
      gc.name as category_name,
      g.meeting_day,
      g.meeting_time::text as meeting_time,
      g.meeting_location,
      g.address_number,
      g.address_complement,
      g.neighborhood,
      g.city,
      g.state,
      g.postal_code,
      g.is_address_public,
      g.latitude,
      g.longitude,
      g.max_capacity,
      g.min_age,
      g.max_age,
      g.accepts_requests,
      leader.full_name as leader_name,
      leader.phone as leader_phone,
      g.cell_photo_url
    from public.groups g
    left join public.group_categories gc on gc.id = g.category_id
    left join public.people leader on leader.id = g.leader_person_id
    where g.company_id = ${church.id}
      and g.type = 'cell'
      and g.is_active = true
      and g.deleted_at is null
    order by g.meeting_day asc, g.name asc
  `

  // Build unique categories with colors
  const categoryMap = new Map<string, { id: string; name: string; color: string }>()
  let colorIdx = 0

  cellRows.forEach((c) => {
    const catName = c.category_name || "Geral"
    const catId = c.category_id || "general"
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, {
        id: catId,
        name: catName,
        color: getCategoryColor(catName, colorIdx++),
      })
    }
  })

  const categories = Array.from(categoryMap.values())

  // Format cells
  const cells: PublicCellItem[] = cellRows.map((c) => {
    const cat = categoryMap.get(c.category_id || "general")
    const isPublic = c.is_address_public ?? true

    let displayAddress = ""
    if (isPublic) {
      const parts = [
        c.meeting_location ? `${c.meeting_location}${c.address_number ? `, ${c.address_number}` : ""}` : "",
        c.neighborhood ? `Bairro ${c.neighborhood}` : "",
        c.city ? `${c.city}${c.state ? ` - ${c.state}` : ""}` : "",
      ].filter(Boolean)
      displayAddress = parts.join(", ")
    } else {
      const parts = [
        c.neighborhood ? `Bairro ${c.neighborhood}` : "",
        c.city ? `${c.city}${c.state ? ` - ${c.state}` : ""}` : "",
        "(Endereço completo informado pelo líder)",
      ].filter(Boolean)
      displayAddress = parts.join(", ")
    }

    const lat = c.latitude !== null && c.latitude !== undefined ? Number(c.latitude) : null
    const lng = c.longitude !== null && c.longitude !== undefined ? Number(c.longitude) : null

    return {
      id: c.id,
      name: c.name,
      description: c.description || "",
      categoryId: c.category_id,
      categoryName: cat?.name || "Geral",
      categoryColor: cat?.color || "#3b82f6",
      meetingDay: c.meeting_day || "Dia a combinar",
      meetingTime: c.meeting_time ? c.meeting_time.slice(0, 5) : null,
      meetingLocation: c.meeting_location || "",
      neighborhood: c.neighborhood || "",
      city: c.city || church.city || "",
      state: c.state || church.state || "",
      postalCode: c.postal_code || "",
      isAddressPublic: isPublic,
      displayAddress: displayAddress || "Local a confirmar",
      latitude: lat,
      longitude: lng,
      maxCapacity: Number(c.max_capacity || 0),
      minAge: c.min_age !== null ? Number(c.min_age) : null,
      maxAge: c.max_age !== null ? Number(c.max_age) : null,
      acceptsRequests: c.accepts_requests ?? true,
      leaderName: c.leader_name || null,
      leaderPhone: c.leader_phone ? c.leader_phone.replace(/\D/g, "") : null,
      cellPhotoUrl: c.cell_photo_url || null,
      meetsToday: checkMeetsToday(c.meeting_day),
    }
  })

  // Calculate default center from cells with coordinates, or default to Brazil/São Paulo coords
  const cellsWithCoords = cells.filter((c) => c.latitude !== null && c.longitude !== null)
  let centerLat = -23.55052
  let centerLng = -46.633308

  if (cellsWithCoords.length > 0) {
    const sumLat = cellsWithCoords.reduce((acc, c) => acc + (c.latitude as number), 0)
    const sumLng = cellsWithCoords.reduce((acc, c) => acc + (c.longitude as number), 0)
    centerLat = sumLat / cellsWithCoords.length
    centerLng = sumLng / cellsWithCoords.length
  }

  return {
    church: {
      id: church.id,
      name: church.name,
      publicName: church.public_name || church.name,
      slug: church.slug,
      phone: church.phone,
      email: church.email,
      city: church.city,
      state: church.state,
      address: church.address,
    },
    cells,
    categories,
    centerCoordinates: {
      latitude: centerLat,
      longitude: centerLng,
    },
  }
}
