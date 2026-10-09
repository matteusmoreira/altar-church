"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EventDetail } from "@/lib/operational/data"
import type { VolunteerDashboardData } from "@/lib/volunteers/types"
import { generateVolunteerScheduleForEvent, publishVolunteerEventSchedule, saveVolunteerServicePlan } from "@/lib/volunteers/v2-actions"
import { EscalaCultoDrawer } from "../voluntariado/components/escala-culto-drawer"

type Position = { departmentId: string; roleId: string; requiredVolunteers: number; instructions: string }
export function EventVolunteerOperations({ event, data, permissions }: { event: EventDetail; data: VolunteerDashboardData | null; permissions: { create: boolean; edit: boolean; publish: boolean } }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [drawer, setDrawer] = useState(false)
  const plan = data?.eventPlans.find(p => p.eventId === event.id)
  const [positions, setPositions] = useState<Position[]>(plan?.positions || [])
  const [template, setTemplate] = useState("")
  if (!data) return <p className="text-sm text-muted-foreground">Seu acesso permite consultar o resumo da escala. Para organizar a equipe, é necessário acesso ao Voluntariado.</p>
  const locked = Boolean(plan?.schedulePublishedAt)
  function update(index: number, patch: Partial<Position>) { setPositions(items => items.map((p, i) => i === index ? { ...p, ...patch } : p)) }
  return <div className="space-y-4"><Card><CardHeader><CardTitle>Equipe e funções</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Prepare a equipe no rascunho. Depois de publicar o evento, revise e publique a escala.</p>{permissions.edit && !locked && <><Label htmlFor="event-team-template">Aplicar modelo</Label><select id="event-team-template" className="h-10 w-full rounded-md border bg-background px-3" value={template} onChange={e => { setTemplate(e.target.value); const model = data.templates.find(t => t.id === e.target.value); if (model) setPositions(model.slots.map(slot => ({ departmentId: slot.departmentId, roleId: slot.roleId, requiredVolunteers: slot.requiredVolunteers, instructions: slot.instructions }))) }}><option value="">Escolha um modelo opcional</option>{data.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></>}
    {positions.map((p, index) => <div key={index} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><div><Label htmlFor={`department-${index}`}>Equipe</Label><select id={`department-${index}`} disabled={!permissions.edit || locked || pending} value={p.departmentId} className="mt-1 h-10 w-full rounded-md border bg-background px-3" onChange={e => update(index, { departmentId: e.target.value, roleId: "" })}><option value="">Selecione</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div><Label htmlFor={`role-${index}`}>Função</Label><select id={`role-${index}`} disabled={!permissions.edit || locked || pending} value={p.roleId} className="mt-1 h-10 w-full rounded-md border bg-background px-3" onChange={e => update(index, { roleId: e.target.value })}><option value="">Selecione</option>{data.departments.find(d => d.id === p.departmentId)?.roles?.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div><Label htmlFor={`slots-${index}`}>Vagas</Label><Input id={`slots-${index}`} type="number" min={1} max={100} disabled={!permissions.edit || locked || pending} value={p.requiredVolunteers} onChange={e => update(index, { requiredVolunteers: Number(e.target.value) })} /></div><div><Label htmlFor={`instructions-${index}`}>Instruções</Label><Textarea id={`instructions-${index}`} disabled={!permissions.edit || locked || pending} value={p.instructions} onChange={e => update(index, { instructions: e.target.value })} /></div>{permissions.edit && !locked && <Button variant="outline" disabled={pending} onClick={() => setPositions(items => items.filter((_, i) => i !== index))}>Remover função</Button>}</div>)}
    {!positions.length && <p className="text-sm text-muted-foreground">Nenhuma função configurada. Se este evento precisar de equipe, escolha um modelo ou adicione funções.</p>}
    <div className="flex flex-wrap gap-2">{permissions.edit && !locked && <><Button variant="outline" disabled={pending} onClick={() => setPositions(items => [...items, { departmentId: "", roleId: "", requiredVolunteers: 1, instructions: "" }])}>Adicionar função</Button><Button disabled={pending || !positions.length} onClick={() => startTransition(async () => { const result = await saveVolunteerServicePlan({ eventId: event.id, positions }); if (result.ok) { toast.success("Equipe salva"); router.refresh() } else toast.error(result.error) })}>Salvar equipe</Button></>}{permissions.create && !locked && <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await generateVolunteerScheduleForEvent(event.id); if (result.ok) { toast.success("Rascunho da escala gerado"); router.refresh() } else toast.error(result.error) })}>Gerar rascunho da escala</Button>}{event.volunteer.shiftCount > 0 && <Button variant="outline" onClick={() => setDrawer(true)}>Preencher pessoas e revisar escala</Button>}{permissions.publish && !locked && <Button disabled={pending || event.status !== "published" || !event.volunteer.shiftCount} onClick={() => startTransition(async () => { const result = await publishVolunteerEventSchedule(event.id); if (result.ok) { toast.success("Escala publicada"); router.refresh() } else toast.error(result.error) })}>Publicar escala</Button>}</div>
    <p className="text-xs text-muted-foreground">{locked ? "Escala publicada. Alterações seguem as regras do Voluntariado." : `Horário da escala: ${new Date(event.startDate).toLocaleString("pt-BR", { timeZone: event.timezone || "America/Sao_Paulo" })} até ${new Date(event.endDate).toLocaleString("pt-BR", { timeZone: event.timezone || "America/Sao_Paulo" })}`}</p>
    {event.volunteer.shiftCount > 0 && <EscalaCultoDrawer eventId={event.id} open={drawer} onOpenChange={setDrawer} data={data} />}
  </CardContent></Card></div>
}
