"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteVolunteerProgramming,
  prepareVolunteerProgrammingMonth,
  publishVolunteerProgrammingEvents,
  saveVolunteerProgramming,
} from "@/lib/volunteers/programming-actions";
import { buildProgrammingOccurrenceDates } from "@/lib/volunteers/recurrence";
import type {
  VolunteerDashboardData,
  VolunteerProgramming,
  VolunteerProgrammingKind,
  VolunteerProgrammingOccurrence,
  VolunteerRecurrenceFrequency,
} from "@/lib/volunteers/types";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const KIND_LABELS: Record<VolunteerProgrammingKind, string> = {
  service: "Culto",
  cleaning: "Faxina",
  rehearsal: "Ensaio",
  meeting: "Reunião",
  outreach: "Ação",
  other: "Outro",
};
const STATUS_LABELS: Record<VolunteerProgrammingOccurrence["status"], string> = {
  no_team: "Sem equipe",
  draft: "Rascunho",
  incomplete: "Incompleta",
  ready: "Pronta",
  published: "Publicada",
};

type PositionForm = {
  departmentId: string;
  roleId: string;
  requiredVolunteers: number;
  instructions: string;
};

type WizardForm = {
  id: string | null;
  occurrenceEventId: string | null;
  editScope: "series" | "occurrence";
  title: string;
  description: string;
  kind: VolunteerProgrammingKind;
  startsAt: string;
  durationMinutes: number;
  location: string;
  recurrenceFrequency: VolunteerRecurrenceFrequency;
  recurrenceWeekdays: number[];
  recurrenceUntil: string;
  positions: PositionForm[];
};

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyForm(): WizardForm {
  const start = localDateTime();
  return {
    id: null,
    occurrenceEventId: null,
    editScope: "series",
    title: "",
    description: "",
    kind: "service",
    startsAt: start,
    durationMinutes: 120,
    location: "",
    recurrenceFrequency: "none",
    recurrenceWeekdays: [new Date(start).getDay()],
    recurrenceUntil: "",
    positions: [],
  };
}

function formFromProgramming(
  programming: VolunteerProgramming,
  occurrence?: VolunteerProgrammingOccurrence,
): WizardForm {
  return {
    id: programming.id,
    occurrenceEventId: occurrence?.eventId ?? null,
    editScope: occurrence ? "occurrence" : "series",
    title: programming.title,
    description: programming.description,
    kind: programming.kind,
    startsAt: localDateTime(occurrence?.startsAt ?? programming.startsAt),
    durationMinutes: programming.durationMinutes,
    location: programming.location,
    recurrenceFrequency: occurrence ? "none" : programming.recurrenceFrequency,
    recurrenceWeekdays: programming.recurrenceWeekdays,
    recurrenceUntil: programming.recurrenceUntil ?? "",
    positions: programming.positions.map((position) => ({
      departmentId: position.departmentId,
      roleId: position.roleId,
      requiredVolunteers: position.requiredVolunteers,
      instructions: position.instructions,
    })),
  };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function sameMonth(value: string, month: Date) {
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Wizard({
  data,
  open,
  initial,
  onOpenChange,
}: {
  data: VolunteerDashboardData;
  open: boolean;
  initial: WizardForm;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initial);
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  function addPosition() {
    const selectedRoleIds = new Set(form.positions.map((item) => item.roleId));
    const department = data.departments.find((item) =>
      item.active && item.roles?.some((role) => role.active && !selectedRoleIds.has(role.id)),
    );
    const role = department?.roles?.find(
      (item) => item.active && !selectedRoleIds.has(item.id),
    );
    if (!department || !role)
      return toast.error("Todas as funções disponíveis já foram adicionadas");
    setForm({
      ...form,
      positions: [...form.positions, {
        departmentId: department.id,
        roleId: role.id,
        requiredVolunteers: 1,
        instructions: role.instructions,
      }],
    });
  }

  function applyTemplate() {
    const template = data.templates.find((item) => item.id === templateId);
    if (!template) return;
    setForm({
      ...form,
      positions: template.slots.map((slot) => ({
        departmentId: slot.departmentId,
        roleId: slot.roleId,
        requiredVolunteers: slot.requiredVolunteers,
        instructions: slot.instructions,
      })),
    });
    toast.success("Modelo copiado. Pode ajustar sem alterar original.");
  }

  function next() {
    if (step === 1 && (!form.title.trim() || !form.startsAt))
      return toast.error("Informe título, data e horário");
    if (step === 2 && form.recurrenceFrequency === "weekly" && form.recurrenceWeekdays.length === 0)
      return toast.error("Escolha ao menos um dia");
    if (step === 3 && form.positions.length === 0)
      return toast.error("Inclua ao menos uma equipe e função");
    setStep(Math.min(4, step + 1));
  }

  async function save() {
    setSaving(true);
    const result = await saveVolunteerProgramming({
      ...form,
      startsAt: new Date(form.startsAt).toISOString(),
      recurrenceUntil: form.recurrenceUntil || null,
      timezone: "America/Sao_Paulo",
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error ?? "Programação não foi salva");
    const info = result.data as { skippedPublished?: number } | undefined;
    toast.success(
      form.editScope === "occurrence"
        ? "Ocorrência atualizada"
        : "Programação salva. Agora escolha as pessoas de cada data.",
    );
    if (info?.skippedPublished) toast.info(`${info.skippedPublished} escala(s) publicada(s) preservada(s)`);
    onOpenChange(false);
    router.refresh();
    window.location.hash = "montar-escala";
    window.setTimeout(() => {
      document.getElementById("montar-escala")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  const stepTitles = ["Dados", "Recorrência", "Equipes", "Revisão"];
  const occurrencePreview = buildProgrammingOccurrenceDates({
    startDate: form.startsAt.slice(0, 10),
    frequency: form.editScope === "occurrence" ? "none" : form.recurrenceFrequency,
    weekdays: form.recurrenceWeekdays,
    until: form.recurrenceUntil || null,
    horizonDays: 90,
  }).slice(0, 3);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="programming-wizard">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar programação" : "Nova programação"}</DialogTitle>
          <DialogDescription>Etapa {step} de 4 · {stepTitles[step - 1]}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {stepTitles.map((title, index) => (
            <div key={title} className="space-y-1">
              <div className={`h-1.5 rounded-full ${step >= index + 1 ? "bg-primary" : "bg-muted"}`} />
              <p className="text-center text-xs text-muted-foreground">{title}</p>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Culto domingo 18h" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as VolunteerProgrammingKind })}>
                {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Data e horário *</Label>
              <Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Duração em minutos</Label>
              <Input type="number" min="1" max="1440" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Local</Label>
              <Input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Templo principal" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 py-2">
            {form.editScope === "occurrence" ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">Mudança vale somente para esta ocorrência.</div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Repetição</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["none", "weekly", "monthly"] as const).map((frequency) => (
                      <Button key={frequency} type="button" variant={form.recurrenceFrequency === frequency ? "default" : "outline"} onClick={() => setForm({ ...form, recurrenceFrequency: frequency })}>
                        {frequency === "none" ? "Uma vez" : frequency === "weekly" ? "Toda semana" : "Todo mês"}
                      </Button>
                    ))}
                  </div>
                </div>
                {form.recurrenceFrequency === "weekly" && (
                  <div className="space-y-2">
                    <Label>Dias da semana</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day, weekday) => (
                        <Button key={day} type="button" size="sm" variant={form.recurrenceWeekdays.includes(weekday) ? "default" : "outline"} onClick={() => setForm({
                          ...form,
                          recurrenceWeekdays: form.recurrenceWeekdays.includes(weekday)
                            ? form.recurrenceWeekdays.filter((item) => item !== weekday)
                            : [...form.recurrenceWeekdays, weekday].sort(),
                        })}>{day}</Button>
                      ))}
                    </div>
                  </div>
                )}
                {form.recurrenceFrequency !== "none" && (
                  <div className="max-w-xs space-y-2">
                    <Label>Termina em (opcional)</Label>
                    <Input type="date" value={form.recurrenceUntil} onChange={(event) => setForm({ ...form, recurrenceUntil: event.target.value })} />
                    <p className="text-xs text-muted-foreground">Vazio = sem término.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <select className="h-10 rounded-md border bg-background px-3" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">Copiar modelo existente</option>
                {data.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <Button type="button" variant="outline" disabled={!templateId} onClick={applyTemplate}>Aplicar modelo</Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-medium">Equipes, funções e quantidades</p><p className="text-xs text-muted-foreground">Aqui você define as vagas. Depois escolherá as pessoas em cada data.</p></div>
              <Button type="button" variant="outline" onClick={addPosition}><Plus className="mr-2 h-4 w-4" />Função</Button>
            </div>
            {form.positions.map((position, index) => {
              const department = data.departments.find((item) => item.id === position.departmentId);
              return (
                <div key={`${position.roleId}-${index}`} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_100px_auto]">
                  <select className="h-10 rounded-md border bg-background px-3" value={position.departmentId} onChange={(event) => {
                    const nextDepartment = data.departments.find((item) => item.id === event.target.value);
                    const selectedRoleIds = new Set(form.positions.filter((_, current) => current !== index).map((item) => item.roleId));
                    const role = nextDepartment?.roles?.find((item) => item.active && !selectedRoleIds.has(item.id));
                    if (!role) return toast.error("Esta equipe não possui outra função disponível");
                    setForm({ ...form, positions: form.positions.map((item, current) => current === index ? { ...item, departmentId: event.target.value, roleId: role?.id ?? "", instructions: role?.instructions ?? "" } : item) });
                  }}>
                    {data.departments.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <select className="h-10 rounded-md border bg-background px-3" value={position.roleId} onChange={(event) => {
                    const role = department?.roles?.find((item) => item.id === event.target.value);
                    setForm({ ...form, positions: form.positions.map((item, current) => current === index ? { ...item, roleId: event.target.value, instructions: role?.instructions ?? "" } : item) });
                  }}>
                    {(department?.roles ?? []).filter((item) => item.active).map((role) => <option key={role.id} value={role.id} disabled={form.positions.some((item, current) => current !== index && item.roleId === role.id)}>{role.name}</option>)}
                  </select>
                  <Input aria-label="Quantidade" type="number" min="1" max="100" value={position.requiredVolunteers} onChange={(event) => setForm({ ...form, positions: form.positions.map((item, current) => current === index ? { ...item, requiredVolunteers: Number(event.target.value) } : item) })} />
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover função" onClick={() => setForm({ ...form, positions: form.positions.filter((_, current) => current !== index) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
            {form.positions.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Adicione equipe e função.</div>}
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Programação</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <p className="font-medium">{form.title}</p>
              <p>{KIND_LABELS[form.kind]} · {formatDate(new Date(form.startsAt).toISOString())}</p>
              <p>{form.durationMinutes} min {form.location ? `· ${form.location}` : ""}</p>
            </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Recorrência</CardTitle></CardHeader><CardContent className="text-sm">
              {form.editScope === "occurrence" ? "Somente esta ocorrência" : form.recurrenceFrequency === "none" ? "Uma vez" : form.recurrenceFrequency === "weekly" ? `Semanal: ${form.recurrenceWeekdays.map((day) => WEEKDAYS[day]).join(", ")}` : "Mensal no mesmo dia"}
              {form.recurrenceUntil && <p>Até {new Date(`${form.recurrenceUntil}T12:00:00`).toLocaleDateString("pt-BR")}</p>}
              {occurrencePreview.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Próximas: {occurrencePreview.map((date) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")).join(", ")}</p>}
            </CardContent></Card>
            <Card className="sm:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Equipe</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
              {form.positions.map((position) => {
                const department = data.departments.find((item) => item.id === position.departmentId);
                const role = department?.roles?.find((item) => item.id === position.roleId);
                return <Badge key={position.roleId} variant="secondary">{department?.name} · {role?.name} · {position.requiredVolunteers}</Badge>;
              })}
            </CardContent></Card>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">Finalizar cria as vagas, sem escolher pessoas. Em seguida, monte cada escala manualmente. Nenhum aviso será enviado antes da publicação.</div>
          </div>
        )}

        <div className="flex justify-between gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={step === 1 || saving} onClick={() => setStep(step - 1)}>Voltar</Button>
          {step < 4 ? <Button type="button" onClick={next}>Continuar</Button> : <Button type="button" disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finalizar</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VolunteerProgrammingWorkspace({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardForm, setWizardForm] = useState<WizardForm>(emptyForm());
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);

  const monthItems = useMemo(() => data.programmings.flatMap((programming) =>
    programming.occurrences.filter((occurrence) => sameMonth(occurrence.startsAt, month)).map((occurrence) => ({ programming, occurrence })),
  ).sort((a, b) => a.occurrence.startsAt.localeCompare(b.occurrence.startsAt)), [data.programmings, month]);

  const byDay = useMemo(() => {
    const map = new Map<number, typeof monthItems>();
    for (const item of monthItems) {
      const day = new Date(item.occurrence.startsAt).getDate();
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return map;
  }, [monthItems]);

  function openNew() {
    setWizardForm(emptyForm());
    setWizardKey((value) => value + 1);
    setWizardOpen(true);
  }

  function openEdit(
    programming: VolunteerProgramming,
    occurrence?: VolunteerProgrammingOccurrence,
    editScope: "occurrence" | "series" = occurrence ? "occurrence" : "series",
  ) {
    const next = formFromProgramming(programming, occurrence);
    if (editScope === "series") {
      next.editScope = "series";
      next.occurrenceEventId = null;
      next.recurrenceFrequency = programming.recurrenceFrequency;
    }
    setWizardForm(next);
    setWizardKey((value) => value + 1);
    setWizardOpen(true);
  }

  async function prepareMonth() {
    setWorking(true);
    const result = await prepareVolunteerProgrammingMonth(monthKey(month));
    setWorking(false);
    if (!result.ok) return toast.error(result.error ?? "Mês não foi preparado");
    const info = result.data as { events?: number; shortages?: number } | undefined;
    toast.success(`${info?.events ?? 0} programações preparadas para escolha manual`);
    if (info?.shortages) toast.warning(`${info.shortages} vaga(s) ainda sem voluntário`);
    router.refresh();
  }

  async function publishSelected() {
    setWorking(true);
    const result = await publishVolunteerProgrammingEvents(selected);
    setWorking(false);
    const info = result.data as { published?: number; failed?: number } | undefined;
    if (!result.ok) toast.error(result.error ?? "Algumas escalas não foram publicadas");
    else toast.success(`${info?.published ?? 0} programação(ões) publicada(s)`);
    setSelected([]);
    router.refresh();
  }

  function openSchedule(eventId: string) {
    const targetId = `escala-${eventId}`;
    window.location.hash = targetId;
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  }

  async function removeProgramming(programming: VolunteerProgramming) {
    if (!window.confirm(`Excluir "${programming.title}"? Rascunhos futuros serão removidos. Escalas publicadas e histórico serão preservados.`)) return;
    setWorking(true);
    const result = await deleteVolunteerProgramming(programming.id);
    setWorking(false);
    if (!result.ok) return toast.error(result.error ?? "Programação não foi excluída");
    const info = result.data as { preservedPublishedOccurrences?: number } | undefined;
    toast.success("Programação excluída");
    if (info?.preservedPublishedOccurrences) toast.info(`${info.preservedPublishedOccurrences} ocorrência(s) publicada(s) preservada(s)`);
    router.refresh();
  }

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(month);
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h2 className="text-xl font-semibold">Programações</h2><p className="text-sm text-muted-foreground">Crie atividade, equipe e escala em um fluxo.</p></div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nova programação</Button>
      </div>

      {data.programmings.some((item) => item.recurrenceNeedsReview) && (
        <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div><p className="font-medium">Recorrências antigas precisam de revisão</p><p className="text-sm text-muted-foreground">Nada foi duplicado. Abra e escolha semanal ou mensal.</p></div>
          <Badge variant="outline">{data.programmings.filter((item) => item.recurrenceNeedsReview).length} pendente(s)</Badge>
        </CardContent></Card>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div><CardTitle className="capitalize">{monthLabel}</CardTitle><CardDescription>Prepare, revise e publique escalas do mês.</CardDescription></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" disabled={working} onClick={prepareMonth}><Sparkles className="mr-2 h-4 w-4" />Preparar mês</Button>
              <Button disabled={working || selected.length === 0} onClick={publishSelected}><Send className="mr-2 h-4 w-4" />Publicar ({selected.length})</Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells(month).map((day, index) => day === null ? <div key={`empty-${index}`} /> : (
              <div key={day} className={`min-h-12 rounded-md border p-1 text-xs ${byDay.has(day) ? "bg-primary/5" : "text-muted-foreground"}`}>
                <span>{day}</span>
                {(byDay.get(day) ?? []).slice(0, 2).map((item) => <div key={item.occurrence.eventId} className="mt-1 truncate rounded bg-primary/15 px-1 text-primary" title={item.programming.title}>{item.programming.title}</div>)}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {monthItems.map(({ programming, occurrence }) => {
            const publishable = occurrence.status === "ready";
            const checked = selected.includes(occurrence.eventId);
            return (
              <div key={occurrence.eventId} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                <input type="checkbox" className="h-4 w-4" aria-label={`Selecionar ${programming.title}`} disabled={!publishable} checked={checked} onChange={(event) => setSelected(event.target.checked ? [...selected, occurrence.eventId] : selected.filter((id) => id !== occurrence.eventId))} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{programming.title}</p><Badge variant={occurrence.status === "published" ? "default" : "secondary"}>{STATUS_LABELS[occurrence.status]}</Badge>{programming.recurrenceFrequency !== "none" && <Repeat className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(occurrence.startsAt)}</span>{programming.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{programming.location}</span>}<span className="flex items-center gap-1"><Users className="h-3 w-3" />{occurrence.assignedVolunteers}/{occurrence.requiredVolunteers}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">{occurrence.status !== "published" && <Button size="sm" onClick={() => openSchedule(occurrence.eventId)}><Users className="mr-1 h-3.5 w-3.5" />Montar escala</Button>}<Button variant="outline" size="sm" disabled={occurrence.status === "published"} onClick={() => openEdit(programming, occurrence)}><Edit className="mr-1 h-3.5 w-3.5" />Esta</Button><Button variant="ghost" size="sm" onClick={() => openEdit(programming, occurrence, "series")}><Repeat className="mr-1 h-3.5 w-3.5" />Esta e próximas</Button>{data.canAdminDelete && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeProgramming(programming)}><Trash2 className="mr-1 h-3.5 w-3.5" />Excluir</Button>}</div>
              </div>
            );
          })}
          {monthItems.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground"><CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-40" />Nenhuma programação neste mês.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Todas as programações</CardTitle><CardDescription>Gerencie séries mesmo quando não existem ocorrências no mês aberto.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.programmings.map((programming) => (
            <div key={programming.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2"><strong>{programming.title}</strong><Badge variant="secondary">{KIND_LABELS[programming.kind]}</Badge>{programming.recurrenceNeedsReview && <Badge variant="outline">Revisar recorrência</Badge>}</div>
              <p className="mt-1 text-xs text-muted-foreground">{programming.recurrenceFrequency === "none" ? "Uma vez" : programming.recurrenceFrequency === "weekly" ? "Semanal" : "Mensal"} · {programming.occurrences.length} ocorrência(s) visível(is)</p>
              <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(programming)}><Edit className="mr-1 h-3.5 w-3.5" />Editar</Button>{data.canAdminDelete && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeProgramming(programming)}><Trash2 className="mr-1 h-3.5 w-3.5" />Excluir</Button>}</div>
            </div>
          ))}
          {data.programmings.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma programação cadastrada.</p>}
        </CardContent>
      </Card>

      {working && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"><div className="flex items-center gap-2 rounded-lg border bg-background p-4 shadow-lg"><Loader2 className="h-5 w-5 animate-spin" />Processando...</div></div>}
      <Wizard key={wizardKey} data={data} open={wizardOpen} initial={wizardForm} onOpenChange={setWizardOpen} />
    </div>
  );
}
