"use client"

import type { KidPrintableLabel, KidPrinterPreference } from "./types"
import { renderLabelToPng } from "./label-renderer"

const STORAGE_KEY = "altar-kids-printer-v1"

export function getKidPrinterPreference(): KidPrinterPreference {
  if (typeof window === "undefined") return { printerName: "", directEnabled: false }
  try { return { printerName: "", directEnabled: false, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") } }
  catch { return { printerName: "", directEnabled: false } }
}

export function saveKidPrinterPreference(preference: KidPrinterPreference) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
}

async function qzClient() {
  const { default: qz } = await import("qz-tray")
  if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 2, delay: 1 })
  return qz
}

export async function listKidPrinters() {
  const qz = await qzClient()
  const printers = await qz.printers.find()
  return Array.isArray(printers) ? printers : [printers]
}

export async function printKidLabelsDirect(labels: KidPrintableLabel[], printerName: string) {
  if (!printerName) throw new Error("Selecione uma impressora")
  const qz = await qzClient()
  for (const label of labels) {
    const png = await renderLabelToPng({ design: label.design, context: label.context, widthMm: label.widthMm, heightMm: label.heightMm, dpi: label.dpi })
    const config = qz.configs.create(printerName, { units: "mm", size: { width: label.widthMm, height: label.heightMm }, margins: 0, scaleContent: true, rasterize: true, colorType: "grayscale", copies: 1 })
    await qz.print(config, [{ type: "pixel", format: "image", flavor: "base64", data: png.split(",")[1] }])
  }
}

export async function testKidPrinter(printerName: string) {
  const qz = await qzClient()
  const config = qz.configs.create(printerName, { units: "mm", size: { width: 62, height: 40 }, margins: 0, scaleContent: true })
  await qz.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: "<div style='font:700 18px Arial;padding:10px'>Altar Kids<br><small>Impressora configurada</small></div>" }])
}
