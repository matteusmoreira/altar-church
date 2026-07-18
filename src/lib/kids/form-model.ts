import { z } from "zod"
import type { KidAddress, KidCustomFieldValue } from "./types"

export const EMPTY_KID_ADDRESS: KidAddress = {
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  country: "Brasil",
}

export function splitFullName(value: string) {
  const fullName = value.trim().replace(/\s+/g, " ")
  const [firstName = "", ...rest] = fullName.split(" ")
  return { fullName, firstName, lastName: rest.join(" ") }
}

export const kidAddressSchema = z.object({
  postalCode: z.string().trim().max(9).optional().default(""),
  street: z.string().trim().max(240).optional().default(""),
  number: z.string().trim().max(30).optional().default(""),
  complement: z.string().trim().max(120).optional().default(""),
  neighborhood: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(2, "UF inválida").optional().default(""),
  country: z.string().trim().max(80).optional().default("Brasil"),
})

export const customValuesSchema = z.array(z.object({
  fieldId: z.string().uuid(),
  value: z.union([z.string().max(5000), z.array(z.string().max(500)).max(100), z.boolean()]),
})).max(100).default([])

export function customValuesToMap(values: KidCustomFieldValue[]) {
  return Object.fromEntries(values.map((item) => [item.fieldId, item.value]))
}

