"use client"
/* eslint-disable @next/next/no-img-element -- generated label previews are data URLs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, type FabricObject } from "fabric"
import { toast } from "sonner"
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Circle, Copy, Eye, EyeOff, Grid3X3,
  Image as ImageIcon, Layers3, Lock, LockOpen, Minus, QrCode, Redo2, RotateCcw, Save, Shapes,
  Square, Tag, TextCursorInput, Trash2, Undo2, Upload, ZoomIn, ZoomOut,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  archiveKidLabelTemplate, duplicateKidLabelTemplate, loadKidLabelRealPreview, loadKidLabelTemplates, publishKidLabelRevision, restoreKidLabelRevision, saveKidLabelDraft, uploadKidLabelAsset,
} from "@/lib/kids/label-actions"
import { createDefaultLabelDesign, KID_LABEL_FIELDS, KID_LABEL_FONTS, labelContainsSensitiveFields, SAMPLE_LABEL_CONTEXT } from "@/lib/kids/label-design"
import { EDITOR_PX_PER_MM, populateLabelCanvas, renderLabelToPng } from "@/lib/kids/label-renderer"
import type { KidCustomFieldDefinition, KidLabelDesign, KidLabelElement, KidLabelKind, KidLabelTemplate } from "@/lib/kids/types"

const PRESETS = [
  { label: "62×40 mm", width: 62, height: 40 }, { label: "50×30 mm", width: 50, height: 30 },
  { label: "100×50 mm", width: 100, height: 50 }, { label: "A4", width: 210, height: 297 },
]
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const uid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `label-${Date.now()}-${Math.random()}`

function newElement(type: KidLabelElement["type"], zIndex: number): KidLabelElement {
  const base: KidLabelElement = { id: uid(), type, name: "Elemento", x: 5, y: 5, width: 24, height: 8, rotation: 0, opacity: 1, visible: true, locked: false, zIndex,
    fontFamily: "Arial", fontSize: 4, fontWeight: 400, textAlign: "left", letterSpacing: 0, color: "#111111", fill: "transparent", stroke: "#111111", strokeWidth: 0.4, radius: 1, shadowColor: "#00000055", shadowBlur: 0, fit: "contain" }
  if (type === "text") return { ...base, name: "Texto", text: "Novo texto" }
  if (type === "field") return { ...base, name: "Nome da criança", field: "childName", fontWeight: 700 }
  if (type === "qr") return { ...base, name: "QR", width: 16, height: 16 }
  if (type === "image") return { ...base, name: "Imagem", width: 20, height: 16, strokeWidth: 0 }
  if (type === "rect") return { ...base, name: "Retângulo", fill: "#e5e7eb" }
  if (type === "circle") return { ...base, name: "Círculo", width: 12, height: 12, fill: "#e5e7eb" }
  if (type === "line") return { ...base, name: "Linha", height: 0.2, strokeWidth: 0.5 }
  return { ...base, name: "Badge", field: "alertSummary", fill: "#f3f4f6", fontWeight: 700 }
}

export function KidsLabelBuilder({ congregations, customFields, availableChildren, canViewHealth }: { congregations: { id: string; name: string }[]; customFields: KidCustomFieldDefinition[]; availableChildren: { id: string; fullName: string }[]; canViewHealth: boolean }) {
  const canvasElement = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const rebuilding = useRef(false)
  const rebuildIdRef = useRef(0)
  const selectedIdsRef = useRef<string[]>([])
  const historyRef = useRef<KidLabelDesign[]>([])
  const futureRef = useRef<KidLabelDesign[]>([])
  const clipboardRef = useRef<KidLabelElement[]>([])
  const [scope, setScope] = useState("")
  const [kind, setKind] = useState<KidLabelKind>("child")
  const [templates, setTemplates] = useState<KidLabelTemplate[]>([])
  const [template, setTemplate] = useState<KidLabelTemplate | null>(null)
  const [design, setDesign] = useState<KidLabelDesign>(() => createDefaultLabelDesign("child"))
  const designRef = useRef<KidLabelDesign>(design)
  const [widthMm, setWidthMm] = useState(62)
  const [heightMm, setHeightMm] = useState(40)
  const [dpi, setDpi] = useState<203 | 300 | 600>(203)
  const [name, setName] = useState("Etiqueta da criança")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  const [pending, setPending] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewKidId, setPreviewKidId] = useState("")
  const [previewLabel, setPreviewLabel] = useState("Dados fictícios")
  const selected = design.elements.find((item) => item.id === selectedIds[0]) ?? null
  useEffect(() => { designRef.current = design }, [design])
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])

  const applyDesign = useCallback((next: KidLabelDesign, remember = true) => {
    setDesign((current) => {
      if (remember) { historyRef.current.push(clone(current)); if (historyRef.current.length > 80) historyRef.current.shift(); futureRef.current = [] }
      return next
    })
  }, [])

  const selectTemplate = useCallback((next: KidLabelTemplate | null) => {
    setTemplate(next)
    const revision = next?.revisions.find((item) => item.id === next.draftRevisionId) ?? next?.revisions[0]
    if (revision) { setDesign(clone(revision.design)); setWidthMm(revision.widthMm); setHeightMm(revision.heightMm); setDpi(revision.dpi); setName(next?.name ?? "Etiqueta") }
    historyRef.current = []; futureRef.current = []; setSelectedIds([])
  }, [])

  const load = useCallback(async (congregationId: string, nextKind: KidLabelKind, preferredTemplateId?: string) => {
    setPending(true)
    try {
      const result = await loadKidLabelTemplates({ congregationId: congregationId || null })
      if (!result.ok || !result.templates) return toast.error(result.error ?? "Não foi possível carregar modelos")
      setTemplates(result.templates)
      const next = result.templates.find((item) => item.id === preferredTemplateId) ?? result.templates.find((item) => item.kind === nextKind && item.isActive) ?? result.templates.find((item) => item.kind === nextKind) ?? null
      selectTemplate(next)
    } finally { setPending(false) }
  }, [selectTemplate])

  useEffect(() => {
    // Server state must refresh when tenant scope or label kind changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(scope, kind)
  }, [scope, kind, load])
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"; link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Montserrat:wght@400;600;700;800&family=Nunito:wght@400;600;700;800&family=Open+Sans:wght@400;600;700&family=Poppins:wght@400;600;700;800&family=Roboto:wght@400;500;700;900&display=swap"
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  useEffect(() => {
    if (!canvasElement.current) return
    const canvas = new Canvas(canvasElement.current, { width: widthMm * EDITOR_PX_PER_MM, height: heightMm * EDITOR_PX_PER_MM, preserveObjectStacking: true, selection: true })
    canvasRef.current = canvas
    const select = () => setSelectedIds(canvas.getActiveObjects().map((object) => (object as FabricObject & { labelElementId?: string }).labelElementId).filter(Boolean) as string[])
    const modified = (event: { target?: FabricObject }) => {
      if (rebuilding.current || !event.target) return
      const object = event.target as FabricObject & { labelElementId?: string }
      if (!object.labelElementId) return
      const current = designRef.current
      const moved = current.elements.find((item) => item.id === object.labelElementId)
      const objectWidth = Math.max(0.5, (object.width ?? 0) * Math.abs(object.scaleX ?? 1) / EDITOR_PX_PER_MM)
      const objectHeight = Math.max(0.5, (object.height ?? 0) * Math.abs(object.scaleY ?? 1) / EDITOR_PX_PER_MM)
      const nextX = Math.max(0, Math.min(widthMm - objectWidth, (object.left ?? 0) / EDITOR_PX_PER_MM))
      const nextY = Math.max(0, Math.min(heightMm - objectHeight, (object.top ?? 0) / EDITOR_PX_PER_MM))
      const deltaX = moved ? nextX - moved.x : 0
      const deltaY = moved ? nextY - moved.y : 0
      applyDesign({ ...current, elements: current.elements.map((item) => item.id === object.labelElementId ? { ...item,
        x: nextX, y: nextY,
        width: objectWidth, height: objectHeight, rotation: object.angle ?? 0,
      } : moved?.groupId && item.groupId === moved.groupId ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item) }, true)
    }
    const moving = (event: { target?: FabricObject }) => {
      if (!event.target) return
      const target = event.target
      const step = designRef.current.gridSizeMm * EDITOR_PX_PER_MM
      const objectWidth = (target.width ?? 0) * Math.abs(target.scaleX ?? 1)
      const objectHeight = (target.height ?? 0) * Math.abs(target.scaleY ?? 1)
      const rawLeft = designRef.current.snapToGrid ? Math.round((target.left ?? 0) / step) * step : target.left ?? 0
      const rawTop = designRef.current.snapToGrid ? Math.round((target.top ?? 0) / step) * step : target.top ?? 0
      target.set({
        left: Math.max(0, Math.min(canvas.width - objectWidth, rawLeft)),
        top: Math.max(0, Math.min(canvas.height - objectHeight, rawTop)),
      })
      const id = (event.target as FabricObject & { labelElementId?: string }).labelElementId
      const source = designRef.current.elements.find((item) => item.id === id)
      if (source?.groupId) {
        const dx = (event.target.left ?? 0) - source.x * EDITOR_PX_PER_MM
        const dy = (event.target.top ?? 0) - source.y * EDITOR_PX_PER_MM
        for (const sibling of canvas.getObjects()) {
          const siblingId = (sibling as FabricObject & { labelElementId?: string }).labelElementId
          const item = designRef.current.elements.find((entry) => entry.id === siblingId)
          if (item?.groupId === source.groupId && item.id !== source.id) sibling.set({ left: item.x * EDITOR_PX_PER_MM + dx, top: item.y * EDITOR_PX_PER_MM + dy })
        }
      }
    }
    canvas.on("selection:created", select); canvas.on("selection:updated", select); canvas.on("selection:cleared", () => setSelectedIds([])); canvas.on("object:modified", modified)
    canvas.on("object:moving", moving)
    return () => { canvas.dispose(); canvasRef.current = null }
  }, [applyDesign, widthMm, heightMm])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rebuildId = ++rebuildIdRef.current
    rebuilding.current = true
    void populateLabelCanvas(canvas, design, SAMPLE_LABEL_CONTEXT, EDITOR_PX_PER_MM, true, () => rebuildId === rebuildIdRef.current).finally(() => {
      if (rebuildId !== rebuildIdRef.current) return
      rebuilding.current = false
      const objects = canvas.getObjects().filter((object) => selectedIdsRef.current.includes((object as FabricObject & { labelElementId?: string }).labelElementId ?? ""))
      if (objects.length === 1) canvas.setActiveObject(objects[0])
      canvas.requestRenderAll()
    })
    return () => { rebuildIdRef.current += 1 }
  }, [design, widthMm, heightMm])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches("input,textarea,select")) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); copySelection() }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); pasteSelection() }
      else if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); removeSelection() }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedIds.length) {
        event.preventDefault(); const step = event.shiftKey ? 5 : 0.5
        applyDesign({ ...design, elements: design.elements.map((item) => selectedIds.includes(item.id) ? { ...item,
          x: item.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
          y: item.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) } : item) })
      }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey)
  })

  function undo() { const previous = historyRef.current.pop(); if (!previous) return; futureRef.current.push(clone(design)); setDesign(previous) }
  function redo() { const next = futureRef.current.pop(); if (!next) return; historyRef.current.push(clone(design)); setDesign(next) }
  function add(type: KidLabelElement["type"]) { const item = newElement(type, design.elements.length); applyDesign({ ...design, elements: [...design.elements, item] }); setSelectedIds([item.id]) }
  function copySelection() { clipboardRef.current = clone(design.elements.filter((item) => selectedIds.includes(item.id))) }
  function pasteSelection() { if (!clipboardRef.current.length) return; const items = clipboardRef.current.map((item, index) => ({ ...item, id: uid(), x: item.x + 2, y: item.y + 2, zIndex: design.elements.length + index })); applyDesign({ ...design, elements: [...design.elements, ...items] }); setSelectedIds(items.map((item) => item.id)) }
  function duplicateSelection() { copySelection(); pasteSelection() }
  function removeSelection() { if (!selectedIds.length) return; applyDesign({ ...design, elements: design.elements.filter((item) => !selectedIds.includes(item.id)) }); setSelectedIds([]) }
  function updateSelected(patch: Partial<KidLabelElement>) { if (!selected) return; applyDesign({ ...design, elements: design.elements.map((item) => item.id === selected.id ? { ...item, ...patch } : item) }) }
  function moveLayer(direction: -1 | 1) { if (!selected) return; const ordered = [...design.elements].sort((a, b) => a.zIndex - b.zIndex); const index = ordered.findIndex((item) => item.id === selected.id); const target = Math.max(0, Math.min(ordered.length - 1, index + direction)); if (target === index) return; [ordered[index], ordered[target]] = [ordered[target], ordered[index]]; applyDesign({ ...design, elements: ordered.map((item, zIndex) => ({ ...item, zIndex })) }) }
  function align(mode: "left" | "center" | "right") { if (!selectedIds.length) return; applyDesign({ ...design, elements: design.elements.map((item) => selectedIds.includes(item.id) ? { ...item, x: mode === "left" ? 0 : mode === "center" ? (widthMm - item.width) / 2 : widthMm - item.width } : item) }) }
  function groupSelection() { if (selectedIds.length < 2) return; const groupId = uid(); applyDesign({ ...design, elements: design.elements.map((item) => selectedIds.includes(item.id) ? { ...item, groupId } : item) }) }
  function ungroupSelection() { applyDesign({ ...design, elements: design.elements.map((item) => selectedIds.includes(item.id) ? { ...item, groupId: null } : item) }) }

  async function uploadImage(background: boolean) {
    if (!template) return
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"
    input.onchange = async () => { const file = input.files?.[0]; if (!file) return; const form = new FormData(); form.set("templateId", template.id); form.set("file", file); setPending(true)
      try { const result = await uploadKidLabelAsset(form); if (!result.ok || !result.file) return toast.error(result.error ?? "Falha no upload")
        if (background) applyDesign({ ...design, backgroundAssetId: result.file.id, backgroundAssetUrl: result.file.url })
        else { const item = { ...newElement("image", design.elements.length), assetId: result.file.id, assetUrl: result.file.url, name: file.name }; applyDesign({ ...design, elements: [...design.elements, item] }); setSelectedIds([item.id]) }
      } finally { setPending(false) }
    }; input.click()
  }

  async function saveDraft() {
    if (!template) return
    setPending(true)
    try { const result = await saveKidLabelDraft({ templateId: template.id, name, widthMm, heightMm, dpi, design }); if (!result.ok) return toast.error(result.error ?? "Falha ao salvar"); toast.success("Rascunho salvo"); await load(scope, kind) } finally { setPending(false) }
  }
  async function publish() {
    if (!template) return
    let revisionId = template.draftRevisionId
    if (!revisionId || template.revisions.find((item) => item.id === revisionId)?.design !== design) {
      const saved = await saveKidLabelDraft({ templateId: template.id, name, widthMm, heightMm, dpi, design }); if (!saved.ok || !saved.revision) return toast.error(saved.error ?? "Falha ao salvar"); revisionId = saved.revision.id
    }
    const sensitive = design.elements.some((item) => KID_LABEL_FIELDS.some((field) => field.value === item.field && field.sensitive) || item.field?.startsWith("custom."))
    if (sensitive && !canViewHealth) return toast.error("Campos sensíveis exigem permissão kids.health.view")
    const confirmed = !sensitive || window.confirm("Este modelo imprime dados sensíveis. Confirma publicação e responsabilidade pelo uso?")
    if (!confirmed) return
    setPending(true)
    try { const result = await publishKidLabelRevision({ templateId: template.id, revisionId, sensitiveConfirmed: sensitive }); if (!result.ok) return toast.error(result.error ?? "Falha ao publicar"); toast.success("Modelo publicado"); await load(scope, kind) } finally { setPending(false) }
  }
  async function restore(revisionId: string) { if (!template || !window.confirm("Restaurar esta revisão como nova versão publicada?")) return; const result = await restoreKidLabelRevision({ templateId: template.id, revisionId, sensitiveConfirmed: canViewHealth }); if (!result.ok) toast.error(result.error ?? "Falha ao restaurar"); else { toast.success("Revisão restaurada"); await load(scope, kind) } }
  async function duplicateTemplate() { if (!template) return; const result = await duplicateKidLabelTemplate(template.id); if (!result.ok || !result.id) return toast.error(result.error ?? "Falha ao duplicar"); toast.success("Modelo duplicado"); await load(scope, kind, result.id) }
  async function archiveTemplate() { if (!template || !window.confirm("Arquivar este modelo? A recepção usará o padrão disponível.")) return; const result = await archiveKidLabelTemplate(template.id); if (!result.ok) return toast.error(result.error ?? "Falha ao arquivar"); toast.success("Modelo arquivado"); await load(scope, kind) }
  async function preview(useReal = false) {
    setPending(true)
    try {
      let context = SAMPLE_LABEL_CONTEXT
      let label = "Dados fictícios"
      if (useReal) {
        if (!previewKidId) return toast.error("Selecione uma criança")
        const result = await loadKidLabelRealPreview({ kidId: previewKidId, includeSensitive: labelContainsSensitiveFields(design) })
        if (!result.ok || !result.previewContext) return toast.error(result.error ?? "Presença não encontrada")
        context = result.previewContext
        label = result.previewLabel ?? "Presença real"
      }
      setPreviewUrl(await renderLabelToPng({ design, context, widthMm, heightMm, dpi }))
      setPreviewLabel(label)
    } catch { toast.error("Não foi possível renderizar preview. Verifique imagens.") } finally { setPending(false) }
  }

  const canvasStyle = useMemo(() => ({ width: widthMm * EDITOR_PX_PER_MM * zoom, height: heightMm * EDITOR_PX_PER_MM * zoom, transformOrigin: "top left" }), [widthMm, heightMm, zoom])

  return (
    <Card className="glass overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />Construtor de etiquetas</CardTitle>
        <CardDescription>Editor livre com modelos versionados para criança e responsável.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div><Label>Aplicar em</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={scope} onChange={(event) => setScope(event.target.value)}><option value="">Padrão da empresa</option>{congregations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div><Label>Modelo</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={kind} onChange={(event) => setKind(event.target.value as KidLabelKind)}><option value="child">Criança</option><option value="guardian">Responsável</option></select></div>
          <div><Label>Nome</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div><Label>Tamanho</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={`${widthMm}x${heightMm}`} onChange={(event) => { const preset = PRESETS.find((item) => `${item.width}x${item.height}` === event.target.value); if (preset) { setWidthMm(preset.width); setHeightMm(preset.height) } }}><option value={`${widthMm}x${heightMm}`}>Personalizado ({widthMm}×{heightMm})</option>{PRESETS.map((item) => <option key={item.label} value={`${item.width}x${item.height}`}>{item.label}</option>)}</select></div>
          <div><Label>DPI</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={dpi} onChange={(event) => setDpi(Number(event.target.value) as 203 | 300 | 600)}><option value="203">203 DPI</option><option value="300">300 DPI</option><option value="600">600 DPI</option></select></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Label>Modelos salvos</Label><select className="h-9 min-w-64 rounded-md border bg-background px-2 text-sm" value={template?.id ?? ""} onChange={(event) => selectTemplate(templates.find((item) => item.id === event.target.value) ?? null)}>{templates.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? " · ativo" : " · rascunho"}</option>)}</select><Button size="sm" variant="outline" onClick={() => void duplicateTemplate()}>Duplicar modelo</Button><Button size="sm" variant="ghost" onClick={() => void archiveTemplate()}>Arquivar</Button></div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24"><Label>Largura mm</Label><Input type="number" min={20} max={297} value={widthMm} onChange={(event) => setWidthMm(Math.max(20, Math.min(297, Number(event.target.value))))} /></div>
          <div className="w-24"><Label>Altura mm</Label><Input type="number" min={15} max={420} value={heightMm} onChange={(event) => setHeightMm(Math.max(15, Math.min(420, Number(event.target.value))))} /></div>
          <Button size="sm" variant="outline" onClick={() => add("text")}><TextCursorInput className="mr-1 h-4 w-4" />Texto</Button>
          <Button size="sm" variant="outline" onClick={() => add("field")}><Tag className="mr-1 h-4 w-4" />Campo</Button>
          <Button size="sm" variant="outline" onClick={() => add("qr")}><QrCode className="mr-1 h-4 w-4" />QR</Button>
          <Button size="sm" variant="outline" onClick={() => void uploadImage(false)}><ImageIcon className="mr-1 h-4 w-4" />Imagem/logo</Button>
          <Button size="sm" variant="outline" onClick={() => void uploadImage(true)}><Upload className="mr-1 h-4 w-4" />Fundo</Button>
          <Button size="icon-sm" variant="outline" title="Retângulo" onClick={() => add("rect")}><Square /></Button><Button size="icon-sm" variant="outline" title="Círculo" onClick={() => add("circle")}><Circle /></Button><Button size="icon-sm" variant="outline" title="Linha" onClick={() => add("line")}><Minus /></Button><Button size="icon-sm" variant="outline" title="Badge" onClick={() => add("badge")}><Shapes /></Button>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md border p-2">
          <Button size="icon-sm" variant="ghost" onClick={undo} title="Desfazer"><Undo2 /></Button><Button size="icon-sm" variant="ghost" onClick={redo} title="Refazer"><Redo2 /></Button>
          <Button size="icon-sm" variant="ghost" onClick={duplicateSelection} title="Duplicar"><Copy /></Button><Button size="icon-sm" variant="ghost" onClick={removeSelection} title="Excluir"><Trash2 /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => align("left")} title="Alinhar esquerda"><AlignLeft /></Button><Button size="icon-sm" variant="ghost" onClick={() => align("center")} title="Centralizar"><AlignCenter /></Button><Button size="icon-sm" variant="ghost" onClick={() => align("right")} title="Alinhar direita"><AlignRight /></Button>
          <Button size="sm" variant="ghost" onClick={groupSelection}>Agrupar</Button><Button size="sm" variant="ghost" onClick={ungroupSelection}>Desagrupar</Button>
          <Button size="icon-sm" variant="ghost" onClick={() => moveLayer(1)} title="Subir camada"><ArrowUp /></Button><Button size="icon-sm" variant="ghost" onClick={() => moveLayer(-1)} title="Descer camada"><ArrowDown /></Button>
          <Button size="icon-sm" variant={design.showGrid ? "secondary" : "ghost"} onClick={() => applyDesign({ ...design, showGrid: !design.showGrid })} title="Grade"><Grid3X3 /></Button>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={design.snapToGrid} onChange={(event) => applyDesign({ ...design, snapToGrid: event.target.checked })} />Snap</label>
          <div className="w-20"><Input aria-label="Grade em milímetros" title="Grade em milímetros" type="number" min="0.5" max="20" step="0.5" value={design.gridSizeMm} onChange={(event) => applyDesign({ ...design, gridSizeMm: Math.max(.5, Number(event.target.value)) })} /></div>
          <div className="w-24"><Input aria-label="Sangria em milímetros" title="Sangria em milímetros" type="number" min="0" max="10" step="0.5" value={design.bleedMm} onChange={(event) => applyDesign({ ...design, bleedMm: Math.max(0, Number(event.target.value)) })} /></div>
          <Button size="icon-sm" variant="ghost" onClick={() => setZoom((value) => Math.max(.4, value - .1))}><ZoomOut /></Button><Badge variant="outline">{Math.round(zoom * 100)}%</Badge><Button size="icon-sm" variant="ghost" onClick={() => setZoom((value) => Math.min(2, value + .1))}><ZoomIn /></Button>
        </div>
        <div className="grid min-h-[520px] gap-4 xl:grid-cols-[1fr_280px]">
          <div className="overflow-auto rounded-lg border bg-muted/40 p-8">
            <div className="relative mx-auto shadow-xl" style={canvasStyle}>
              <div className="absolute -left-6 top-0 h-full w-5 border-r text-[8px] text-muted-foreground">{Array.from({ length: Math.ceil(heightMm / 10) + 1 }, (_, i) => <span key={i} className="absolute right-1" style={{ top: i * 10 * EDITOR_PX_PER_MM * zoom }}>{i * 10}</span>)}</div>
              <div className="absolute -top-6 left-0 h-5 w-full border-b text-[8px] text-muted-foreground">{Array.from({ length: Math.ceil(widthMm / 10) + 1 }, (_, i) => <span key={i} className="absolute" style={{ left: i * 10 * EDITOR_PX_PER_MM * zoom }}>{i * 10}</span>)}</div>
              {design.showGrid && <div className="pointer-events-none absolute inset-0 z-10" style={{ backgroundImage: "linear-gradient(to right, rgba(100,116,139,.15) 1px, transparent 1px),linear-gradient(to bottom, rgba(100,116,139,.15) 1px, transparent 1px)", backgroundSize: `${design.gridSizeMm * EDITOR_PX_PER_MM * zoom}px ${design.gridSizeMm * EDITOR_PX_PER_MM * zoom}px` }} />}
              <div className="pointer-events-none absolute z-20 border border-dashed border-red-400/70" style={{ inset: design.bleedMm * EDITOR_PX_PER_MM * zoom }} />
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}><canvas ref={canvasElement} /></div>
            </div>
          </div>
          <div className="space-y-4 overflow-auto rounded-lg border p-3">
            <div><Label>Fundo</Label><div className="flex gap-2"><Input type="color" className="w-14 p-1" value={design.backgroundColor.startsWith("#") ? design.backgroundColor : "#ffffff"} onChange={(event) => applyDesign({ ...design, backgroundColor: event.target.value })} /><select className="h-9 flex-1 rounded-md border bg-background px-2 text-sm" value={design.backgroundFit} onChange={(event) => applyDesign({ ...design, backgroundFit: event.target.value as KidLabelDesign["backgroundFit"] })}><option value="cover">Cobrir</option><option value="contain">Conter</option><option value="stretch">Esticar</option></select></div><div className="mt-2 flex items-center gap-2"><input type="checkbox" checked={Boolean(design.backgroundGradientFrom && design.backgroundGradientTo)} onChange={(event) => applyDesign({ ...design, backgroundGradientFrom: event.target.checked ? "#ffffff" : null, backgroundGradientTo: event.target.checked ? "#dbeafe" : null })} /><span className="text-xs">Gradiente</span>{design.backgroundGradientFrom && <><Input type="color" className="w-10 p-1" value={design.backgroundGradientFrom} onChange={(event) => applyDesign({ ...design, backgroundGradientFrom: event.target.value })} /><Input type="color" className="w-10 p-1" value={design.backgroundGradientTo ?? "#dbeafe"} onChange={(event) => applyDesign({ ...design, backgroundGradientTo: event.target.value })} /></>}</div></div>
            <div className="flex items-center justify-between"><Label className="flex items-center gap-1"><Layers3 className="h-4 w-4" />Camadas</Label><Badge variant="outline">{design.elements.length}</Badge></div>
            <div className="max-h-44 space-y-1 overflow-auto">{[...design.elements].sort((a,b) => b.zIndex-a.zIndex).map((item) => <button key={item.id} type="button" className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${selectedIds.includes(item.id) ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setSelectedIds([item.id])}><span className="truncate flex-1">{item.name}</span>{item.groupId && <Badge variant="outline">G</Badge>}{item.locked ? <Lock className="h-3 w-3" /> : null}{item.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button>)}</div>
            {selected ? <>
              <div><Label>Nome da camada</Label><Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} /></div>
              {selected.type === "text" && <div><Label>Texto</Label><Input value={selected.text ?? ""} onChange={(event) => updateSelected({ text: event.target.value })} /></div>}
              {(selected.type === "field" || selected.type === "badge") && <div><Label>Campo dinâmico</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selected.field ?? "childName"} onChange={(event) => updateSelected({ field: event.target.value, name: KID_LABEL_FIELDS.find((field) => field.value === event.target.value)?.label ?? customFields.find((field) => event.target.value.endsWith(field.id))?.name ?? "Campo" })}>{KID_LABEL_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}{field.sensitive ? " ⚠" : ""}</option>)}{customFields.filter((field) => field.isActive).flatMap((field) => field.targets.map((target) => <option key={`${target}-${field.id}`} value={`custom.${target}.${field.id}`}>{field.name} ({target === "child" ? "criança" : "responsável"}) ⚠</option>))}</select></div>}
              {selected.type === "image" && <div><Label>Origem</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selected.field ?? "asset"} onChange={(event) => updateSelected({ field: event.target.value === "asset" ? undefined : event.target.value, name: event.target.value === "childPhotoUrl" ? "Foto da criança" : selected.name })}><option value="asset">Imagem enviada</option><option value="childPhotoUrl">Foto da criança ⚠</option></select></div>}
              <div className="grid grid-cols-2 gap-2">{(["x","y","width","height","rotation"] as const).map((key) => <div key={key}><Label className="capitalize">{key}</Label><Input type="number" step="0.5" value={selected[key]} onChange={(event) => updateSelected({ [key]: Number(event.target.value) })} /></div>)}</div>
              {(["text","field","badge"] as KidLabelElement["type"][]).includes(selected.type) && <><div><Label>Fonte</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selected.fontFamily} onChange={(event) => updateSelected({ fontFamily: event.target.value })}>{KID_LABEL_FONTS.map((font) => <option key={font}>{font}</option>)}</select></div><div className="grid grid-cols-2 gap-2"><div><Label>Tamanho</Label><Input type="number" step=".2" value={selected.fontSize} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) })} /></div><div><Label>Peso</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selected.fontWeight} onChange={(event) => updateSelected({ fontWeight: Number(event.target.value) })}>{[400,500,600,700,800,900].map((weight) => <option key={weight}>{weight}</option>)}</select></div></div></>}
              {(["text","field","badge"] as KidLabelElement["type"][]).includes(selected.type) && <div className="grid grid-cols-2 gap-2"><div><Label>Alinhamento</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selected.textAlign} onChange={(event) => updateSelected({ textAlign: event.target.value as KidLabelElement["textAlign"] })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></div><div><Label>Espaçamento</Label><Input type="number" step=".1" value={selected.letterSpacing} onChange={(event) => updateSelected({ letterSpacing: Number(event.target.value) })} /></div></div>}
              <div className="grid grid-cols-2 gap-2"><div><Label>Cor</Label><Input type="color" value={(selected.color ?? "#111111").startsWith("#") ? selected.color : "#111111"} onChange={(event) => updateSelected({ color: event.target.value })} /></div><div><Label>Preenchimento</Label><Input type="color" value={(selected.fill ?? "#ffffff").startsWith("#") ? selected.fill : "#ffffff"} onChange={(event) => updateSelected({ fill: event.target.value })} /></div></div>
              <div className="grid grid-cols-3 gap-2"><div><Label>Borda</Label><Input type="color" value={(selected.stroke ?? "#111111").startsWith("#") ? selected.stroke : "#111111"} onChange={(event) => updateSelected({ stroke: event.target.value })} /></div><div><Label>Espessura</Label><Input type="number" min="0" step=".1" value={selected.strokeWidth} onChange={(event) => updateSelected({ strokeWidth: Number(event.target.value) })} /></div><div><Label>Raio</Label><Input type="number" min="0" step=".5" value={selected.radius} onChange={(event) => updateSelected({ radius: Number(event.target.value) })} /></div></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>Sombra</Label><Input type="number" min="0" step=".5" value={selected.shadowBlur} onChange={(event) => updateSelected({ shadowBlur: Number(event.target.value) })} /></div>{selected.type === "image" && <div><Label>Ajuste</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selected.fit} onChange={(event) => updateSelected({ fit: event.target.value as KidLabelElement["fit"] })}><option value="contain">Conter</option><option value="cover">Cobrir</option><option value="stretch">Esticar</option></select></div>}</div>
              {(["rect","circle"] as KidLabelElement["type"][]).includes(selected.type) && <div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(selected.gradientFrom && selected.gradientTo)} onChange={(event) => updateSelected({ gradientFrom: event.target.checked ? "#ffffff" : undefined, gradientTo: event.target.checked ? "#2563eb" : undefined })} />Gradiente</label>{selected.gradientFrom && <div className="mt-1 flex gap-2"><Input type="color" value={selected.gradientFrom} onChange={(event) => updateSelected({ gradientFrom: event.target.value })} /><Input type="color" value={selected.gradientTo ?? "#2563eb"} onChange={(event) => updateSelected({ gradientTo: event.target.value })} /><Input type="number" min="0" max="360" value={selected.gradientAngle ?? 0} onChange={(event) => updateSelected({ gradientAngle: Number(event.target.value) })} /></div>}</div>}
              <div><Label>Opacidade {Math.round(selected.opacity*100)}%</Label><input className="w-full" type="range" min="0" max="1" step=".05" value={selected.opacity} onChange={(event) => updateSelected({ opacity: Number(event.target.value) })} /></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => updateSelected({ locked: !selected.locked })}>{selected.locked ? <LockOpen className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}{selected.locked ? "Desbloquear" : "Bloquear"}</Button><Button size="sm" variant="outline" onClick={() => updateSelected({ visible: !selected.visible })}>{selected.visible ? "Ocultar" : "Exibir"}</Button></div>
            </> : <p className="text-sm text-muted-foreground">Selecione elemento para editar.</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Button onClick={() => void saveDraft()} disabled={pending}><Save className="mr-1 h-4 w-4" />Salvar rascunho</Button><Button variant="secondary" onClick={() => void publish()} disabled={pending}>Publicar</Button><Button variant="outline" onClick={() => void preview()} disabled={pending}><Eye className="mr-1 h-4 w-4" />Preview fictício</Button><select className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm" value={previewKidId} onChange={(event) => setPreviewKidId(event.target.value)}><option value="">Presença real…</option>{availableChildren.map((child) => <option key={child.id} value={child.id}>{child.fullName}</option>)}</select><Button variant="outline" onClick={() => void preview(true)} disabled={pending || !previewKidId}>Testar presença</Button>{template?.publishedRevisionId && <Badge>Publicado v{template.revisions.find((item) => item.id === template.publishedRevisionId)?.version}</Badge>}</div>
        {previewUrl && <div className="rounded-lg border bg-muted p-4"><p className="mb-2 text-center text-xs text-muted-foreground">{previewLabel}</p><img src={previewUrl} alt="Preview da etiqueta" className="mx-auto max-h-96 max-w-full bg-white shadow" /></div>}
        {template && <div className="space-y-2"><Label>Histórico imutável</Label><div className="flex flex-wrap gap-2">{template.revisions.map((revision) => <Button key={revision.id} size="sm" variant={revision.id === template.publishedRevisionId ? "secondary" : "outline"} onClick={() => revision.id !== template.publishedRevisionId && void restore(revision.id)}><RotateCcw className="mr-1 h-3.5 w-3.5" />v{revision.version} · {revision.status}</Button>)}</div></div>}
      </CardContent>
    </Card>
  )
}
