import assert from "node:assert/strict"
import { test } from "node:test"
import {
  parseMeetingHour,
  formatTimeFilterLabel,
  shortTimeFilterLabel,
  matchesTimeFilter,
  getAvailableCities,
  getAvailableNeighborhoods,
  getAvailableTimes,
} from "../src/lib/cells/filter-helpers.ts"

const mockCells = [
  {
    id: "cell-1",
    name: "Célula do Matteus",
    description: "Comunhão e fé",
    categoryId: "cat-1",
    categoryName: "Jovens",
    categoryColor: "#f97316",
    meetingDay: "Terça",
    meetingTime: "20:00",
    meetingLocation: "Rua Central, 100",
    neighborhood: "Extensão do Bosque",
    city: "Rio das Ostras",
    state: "RJ",
    postalCode: "28890-000",
    isAddressPublic: true,
    displayAddress: "Rua Central, 100, Bairro Extensão do Bosque, Rio das Ostras - RJ",
    latitude: -22.52,
    longitude: -41.94,
    maxCapacity: 15,
    minAge: 18,
    maxAge: 35,
    acceptsRequests: true,
    leaderName: "Matteus",
    leaderPhone: "22999999999",
    cellPhotoUrl: null,
    meetsToday: false,
  },
  {
    id: "cell-2",
    name: "Célula Esperança",
    description: "Para famílias",
    categoryId: "cat-2",
    categoryName: "Família",
    categoryColor: "#10b981",
    meetingDay: "Quarta",
    meetingTime: "10:30",
    meetingLocation: "Av Costazul, 200",
    neighborhood: "Costazul",
    city: "Rio das Ostras",
    state: "RJ",
    postalCode: "28890-000",
    isAddressPublic: true,
    displayAddress: "Av Costazul, 200, Bairro Costazul, Rio das Ostras - RJ",
    latitude: -22.53,
    longitude: -41.93,
    maxCapacity: 20,
    minAge: null,
    maxAge: null,
    acceptsRequests: true,
    leaderName: "Ana",
    leaderPhone: "22988888888",
    cellPhotoUrl: null,
    meetsToday: false,
  },
  {
    id: "cell-3",
    name: "Célula Macaé Centro",
    description: "Grupo de comunhão",
    categoryId: "cat-1",
    categoryName: "Jovens",
    categoryColor: "#f97316",
    meetingDay: "Sexta",
    meetingTime: "15:00",
    meetingLocation: "Rua das Flores, 50",
    neighborhood: "Centro",
    city: "Macaé",
    state: "RJ",
    postalCode: "27910-000",
    isAddressPublic: true,
    displayAddress: "Rua das Flores, 50, Bairro Centro, Macaé - RJ",
    latitude: -22.38,
    longitude: -41.78,
    maxCapacity: 12,
    minAge: null,
    maxAge: null,
    acceptsRequests: true,
    leaderName: "Carlos",
    leaderPhone: null,
    cellPhotoUrl: null,
    meetsToday: false,
  },
]

test("parseMeetingHour extracts hour correctly", () => {
  assert.equal(parseMeetingHour("20:00"), 20)
  assert.equal(parseMeetingHour("10:30"), 10)
  assert.equal(parseMeetingHour("08:15"), 8)
  assert.equal(parseMeetingHour(null), null)
  assert.equal(parseMeetingHour("invalid"), null)
})

test("formatTimeFilterLabel formats period and exact labels correctly", () => {
  assert.equal(formatTimeFilterLabel("all"), "Todos os horários")
  assert.equal(formatTimeFilterLabel("morning"), "Manhã (até 12h)")
  assert.equal(formatTimeFilterLabel("afternoon"), "Tarde (12h às 18h)")
  assert.equal(formatTimeFilterLabel("night"), "Noite (a partir das 18h)")
  assert.equal(formatTimeFilterLabel("time:20:00"), "20:00")
})

test("shortTimeFilterLabel formats short punchy labels for compact triggers", () => {
  assert.equal(shortTimeFilterLabel("all"), "Horário")
  assert.equal(shortTimeFilterLabel("morning"), "Manhã")
  assert.equal(shortTimeFilterLabel("afternoon"), "Tarde")
  assert.equal(shortTimeFilterLabel("night"), "Noite")
  assert.equal(shortTimeFilterLabel("time:20:00"), "20:00")
})

test("matchesTimeFilter filters by period and exact time", () => {
  // All
  assert.equal(matchesTimeFilter("20:00", "all"), true)
  assert.equal(matchesTimeFilter(null, "all"), true)

  // Morning (before 12h)
  assert.equal(matchesTimeFilter("10:30", "morning"), true)
  assert.equal(matchesTimeFilter("15:00", "morning"), false)
  assert.equal(matchesTimeFilter("20:00", "morning"), false)

  // Afternoon (12h to 18h)
  assert.equal(matchesTimeFilter("15:00", "afternoon"), true)
  assert.equal(matchesTimeFilter("10:30", "afternoon"), false)
  assert.equal(matchesTimeFilter("20:00", "afternoon"), false)

  // Night (from 18h)
  assert.equal(matchesTimeFilter("20:00", "night"), true)
  assert.equal(matchesTimeFilter("19:30", "night"), true)
  assert.equal(matchesTimeFilter("15:00", "night"), false)
  assert.equal(matchesTimeFilter("10:30", "night"), false)

  // Exact time
  assert.equal(matchesTimeFilter("20:00", "time:20:00"), true)
  assert.equal(matchesTimeFilter("19:30", "time:20:00"), false)
})

test("getAvailableCities extracts and counts unique cities", () => {
  const cities = getAvailableCities(mockCells)
  assert.equal(cities.length, 2)
  assert.deepEqual(cities, [
    { value: "Macaé", label: "Macaé", count: 1 },
    { value: "Rio das Ostras", label: "Rio das Ostras", count: 2 },
  ])
})

test("getAvailableNeighborhoods extracts and filters by city if specified", () => {
  const allNeighborhoods = getAvailableNeighborhoods(mockCells, "all")
  assert.equal(allNeighborhoods.length, 3)

  const rioNeighborhoods = getAvailableNeighborhoods(mockCells, "Rio das Ostras")
  assert.equal(rioNeighborhoods.length, 2)
  assert.deepEqual(rioNeighborhoods, [
    { value: "Costazul", label: "Costazul", count: 1 },
    { value: "Extensão do Bosque", label: "Extensão do Bosque", count: 1 },
  ])
})

test("getAvailableTimes computes period and exact time options", () => {
  const times = getAvailableTimes(mockCells)
  assert.deepEqual(times.periods, [
    { value: "morning", label: "Manhã (até 12h)", count: 1 },
    { value: "afternoon", label: "Tarde (12h às 18h)", count: 1 },
    { value: "night", label: "Noite (a partir das 18h)", count: 1 },
  ])
  assert.equal(times.exactTimes.length, 3)
  assert.deepEqual(times.exactTimes.map((t) => t.value), [
    "time:10:30",
    "time:15:00",
    "time:20:00",
  ])
})
