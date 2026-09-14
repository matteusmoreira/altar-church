import type { PublicCellItem } from "./public-cells"

export interface FilterOption {
  value: string
  label: string
  count: number
}

export function parseMeetingHour(meetingTime: string | null | undefined): number | null {
  if (!meetingTime) return null
  const [hourStr] = meetingTime.trim().split(":")
  const hour = Number.parseInt(hourStr, 10)
  return Number.isNaN(hour) ? null : hour
}

export function formatTimeFilterLabel(value: string): string {
  if (value === "all") return "Todos os horários"
  if (value === "morning") return "Manhã (até 12h)"
  if (value === "afternoon") return "Tarde (12h às 18h)"
  if (value === "night") return "Noite (a partir das 18h)"
  if (value.startsWith("time:")) return value.replace("time:", "")
  return value
}

export function shortTimeFilterLabel(value: string): string {
  if (value === "all") return "Horário"
  if (value === "morning") return "Manhã"
  if (value === "afternoon") return "Tarde"
  if (value === "night") return "Noite"
  if (value.startsWith("time:")) return value.replace("time:", "")
  return value
}

export function matchesTimeFilter(meetingTime: string | null | undefined, filter: string): boolean {
  if (!filter || filter === "all") return true
  if (!meetingTime) return false

  const hour = parseMeetingHour(meetingTime)

  if (filter === "morning") {
    return hour !== null && hour < 12
  }
  if (filter === "afternoon") {
    return hour !== null && hour >= 12 && hour < 18
  }
  if (filter === "night") {
    return hour !== null && hour >= 18
  }
  if (filter.startsWith("time:")) {
    const target = filter.replace("time:", "").trim()
    const cleanTime = meetingTime.trim().length > 5 ? meetingTime.trim().slice(0, 5) : meetingTime.trim()
    return cleanTime === target
  }

  return meetingTime.trim() === filter.trim()
}

export function getAvailableCities(cells: PublicCellItem[]): FilterOption[] {
  const cityMap = new Map<string, { label: string; count: number }>()

  for (const cell of cells) {
    const rawCity = cell.city?.trim()
    if (!rawCity) continue
    const lowerKey = rawCity.toLowerCase()
    const existing = cityMap.get(lowerKey)
    if (existing) {
      existing.count += 1
    } else {
      cityMap.set(lowerKey, { label: rawCity, count: 1 })
    }
  }

  return Array.from(cityMap.values())
    .map(({ label, count }) => ({
      value: label,
      label,
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

export function getAvailableNeighborhoods(
  cells: PublicCellItem[],
  selectedCity: string = "all"
): FilterOption[] {
  const neighMap = new Map<string, { label: string; count: number }>()

  for (const cell of cells) {
    if (
      selectedCity !== "all" &&
      cell.city?.trim().toLowerCase() !== selectedCity.trim().toLowerCase()
    ) {
      continue
    }

    const rawNeigh = cell.neighborhood?.trim()
    if (!rawNeigh) continue
    const lowerKey = rawNeigh.toLowerCase()
    const existing = neighMap.get(lowerKey)
    if (existing) {
      existing.count += 1
    } else {
      neighMap.set(lowerKey, { label: rawNeigh, count: 1 })
    }
  }

  return Array.from(neighMap.values())
    .map(({ label, count }) => ({
      value: label,
      label,
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

export interface AvailableTimesResult {
  periods: FilterOption[]
  exactTimes: FilterOption[]
}

export function getAvailableTimes(cells: PublicCellItem[]): AvailableTimesResult {
  let morningCount = 0
  let afternoonCount = 0
  let nightCount = 0
  const exactCounts = new Map<string, number>()

  for (const cell of cells) {
    let time = cell.meetingTime?.trim()
    if (!time) continue

    if (time.length > 5 && time.includes(":")) {
      time = time.slice(0, 5)
    }

    const hour = parseMeetingHour(time)
    if (hour !== null) {
      if (hour < 12) morningCount++
      else if (hour < 18) afternoonCount++
      else nightCount++
    }

    exactCounts.set(time, (exactCounts.get(time) ?? 0) + 1)
  }

  const periods: FilterOption[] = [
    { value: "morning", label: "Manhã (até 12h)", count: morningCount },
    { value: "afternoon", label: "Tarde (12h às 18h)", count: afternoonCount },
    { value: "night", label: "Noite (a partir das 18h)", count: nightCount },
  ]

  const exactTimes: FilterOption[] = Array.from(exactCounts.entries())
    .map(([time, count]) => ({
      value: `time:${time}`,
      label: time,
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return { periods, exactTimes }
}
