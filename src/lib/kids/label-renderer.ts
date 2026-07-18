"use client"

import QRCode from "qrcode"
import { Circle, FabricImage, Gradient, Line, Rect, Shadow, StaticCanvas, Textbox, type FabricObject } from "fabric"
import { resolveLabelField } from "./label-design"
import type { KidLabelDesign, KidLabelElement, KidLabelRenderContext } from "./types"

export const EDITOR_PX_PER_MM = 6

function fitImage(image: FabricImage, width: number, height: number, fit: KidLabelElement["fit"] = "contain") {
  const sourceWidth = image.width || 1
  const sourceHeight = image.height || 1
  const scaleX = width / sourceWidth
  const scaleY = height / sourceHeight
  if (fit === "stretch") image.set({ scaleX, scaleY })
  else {
    const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)
    image.set({ scaleX: scale, scaleY: scale })
  }
  image.set({ left: (width - sourceWidth * image.scaleX) / 2, top: (height - sourceHeight * image.scaleY) / 2 })
}

async function loadImage(url: string) {
  return FabricImage.fromURL(url, { crossOrigin: "anonymous" })
}

function common(element: KidLabelElement, scale: number, interactive: boolean) {
  return {
    left: element.x * scale, top: element.y * scale, angle: element.rotation, opacity: element.opacity,
    visible: element.visible, selectable: interactive && !element.locked, evented: interactive && !element.locked,
    lockMovementX: element.locked, lockMovementY: element.locked,
    shadow: element.shadowBlur ? new Shadow({ color: element.shadowColor ?? "#00000055", blur: element.shadowBlur * scale, offsetX: 0, offsetY: 1 * scale }) : undefined,
  }
}

function fillFor(element: KidLabelElement, width: number, height: number) {
  if (!element.gradientFrom || !element.gradientTo) return element.fill ?? "transparent"
  const angle = (element.gradientAngle ?? 0) * Math.PI / 180
  const x = Math.cos(angle) * width
  const y = Math.sin(angle) * height
  return new Gradient({ type: "linear", coords: { x1: (width - x) / 2, y1: (height - y) / 2, x2: (width + x) / 2, y2: (height + y) / 2 }, colorStops: [{ offset: 0, color: element.gradientFrom }, { offset: 1, color: element.gradientTo }] })
}

export async function createFabricObject(element: KidLabelElement, context: KidLabelRenderContext, scale: number, interactive: boolean): Promise<FabricObject | null> {
  const width = element.width * scale
  const height = element.height * scale
  const base = common(element, scale, interactive)
  let object: FabricObject | null = null
  if (element.type === "text" || element.type === "field" || element.type === "badge") {
    const text = element.type === "text" ? element.text ?? "Texto" : resolveLabelField(context, element.field)
    if (element.type === "badge") {
      object = new Textbox(text || "ALERTA", { ...base, width, height, fontFamily: element.fontFamily, fontSize: (element.fontSize ?? 3) * scale,
        fontWeight: element.fontWeight ?? 400, textAlign: element.textAlign, charSpacing: (element.letterSpacing ?? 0) * 20,
        fill: element.color ?? "#111111", backgroundColor: element.fill ?? "#eeeeee", padding: 1 * scale })
    } else {
      object = new Textbox(text, { ...base, width, height, fontFamily: element.fontFamily, fontSize: (element.fontSize ?? 3) * scale,
        fontWeight: element.fontWeight ?? 400, textAlign: element.textAlign, charSpacing: (element.letterSpacing ?? 0) * 20,
        fill: element.color ?? "#111111", lineHeight: 1.05 })
    }
  } else if (element.type === "rect") {
    object = new Rect({ ...base, width, height, fill: fillFor(element, width, height), stroke: element.stroke, strokeWidth: (element.strokeWidth ?? 0) * scale, rx: (element.radius ?? 0) * scale, ry: (element.radius ?? 0) * scale })
  } else if (element.type === "circle") {
    object = new Circle({ ...base, radius: Math.min(width, height) / 2, scaleX: width / Math.min(width, height), scaleY: height / Math.min(width, height), fill: fillFor(element, width, height), stroke: element.stroke, strokeWidth: (element.strokeWidth ?? 0) * scale })
  } else if (element.type === "line") {
    object = new Line([0, 0, width, height], { ...base, stroke: element.stroke ?? "#111111", strokeWidth: Math.max(1, (element.strokeWidth ?? 0.4) * scale) })
  } else if (element.type === "qr") {
    const dataUrl = await QRCode.toDataURL(context.qrPayload || "ak1.preview", { margin: 0, errorCorrectionLevel: "M", width: Math.max(128, Math.round(width * 2)) })
    const image = await loadImage(dataUrl)
    image.set(base)
    fitImage(image, width, height, "stretch")
    image.set({ left: element.x * scale, top: element.y * scale })
    object = image
  } else if (element.type === "image" && (element.assetUrl || element.field === "childPhotoUrl")) {
    const imageUrl = element.field === "childPhotoUrl" ? context.childPhotoUrl : element.assetUrl
    if (!imageUrl) return null
    const image = await loadImage(imageUrl)
    image.set(base)
    fitImage(image, width, height, element.fit)
    image.set({ left: element.x * scale + (width - (image.width || 1) * image.scaleX) / 2, top: element.y * scale + (height - (image.height || 1) * image.scaleY) / 2 })
    object = image
  }
  if (object) {
    object.set({ name: element.id })
    ;(object as FabricObject & { labelElementId?: string }).labelElementId = element.id
  }
  return object
}

export async function populateLabelCanvas(canvas: StaticCanvas, design: KidLabelDesign, context: KidLabelRenderContext, scale: number, interactive = false) {
  canvas.clear()
  canvas.backgroundColor = design.backgroundGradientFrom && design.backgroundGradientTo ? new Gradient({ type: "linear", coords: { x1: 0, y1: 0, x2: canvas.width, y2: canvas.height }, colorStops: [{ offset: 0, color: design.backgroundGradientFrom }, { offset: 1, color: design.backgroundGradientTo }] }) : design.backgroundColor || "#ffffff"
  if (design.backgroundAssetUrl) {
    const background = await loadImage(design.backgroundAssetUrl)
    fitImage(background, canvas.width, canvas.height, design.backgroundFit)
    background.set({ selectable: false, evented: false })
    canvas.backgroundImage = background
  }
  const elements = [...design.elements].sort((a, b) => a.zIndex - b.zIndex)
  for (const element of elements) {
    const object = await createFabricObject(element, context, scale, interactive)
    if (object) canvas.add(object)
  }
  canvas.requestRenderAll()
}

export async function renderLabelToPng(input: { design: KidLabelDesign; context: KidLabelRenderContext; widthMm: number; heightMm: number; dpi: number }) {
  await Promise.allSettled(["Arial", "Inter", "Roboto", "Montserrat", "Poppins", "Nunito", "Open Sans"].map((font) => document.fonts.load(`16px "${font}"`)))
  const targetScale = input.dpi / 25.4
  const scale = Math.min(targetScale, 4096 / Math.max(input.widthMm, input.heightMm))
  const element = document.createElement("canvas")
  element.width = Math.max(1, Math.round(input.widthMm * scale))
  element.height = Math.max(1, Math.round(input.heightMm * scale))
  const canvas = new StaticCanvas(element, { width: element.width, height: element.height, backgroundColor: "#ffffff", enableRetinaScaling: false })
  await populateLabelCanvas(canvas, input.design, input.context, scale, false)
  const dataUrl = canvas.toDataURL({ format: "png", quality: 1, multiplier: 1 })
  canvas.dispose()
  return dataUrl
}
