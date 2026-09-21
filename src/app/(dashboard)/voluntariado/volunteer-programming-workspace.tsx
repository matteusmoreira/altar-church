"use client";

import { useMemo, useState } from "react";
import {
  buildWorkspaceEvents,
  workspaceMonth,
} from "@/lib/volunteers/workspace";
import { useVolunteerNavigation } from "./use-volunteer-navigation";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Send,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { MetricCard, MetricGrid, SectionHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteVolunteerProgramming,
  prepareVolunteerProgrammingMonth,
  publishVolunteerProgrammingEvents,
  saveVolunteerProgramming,
} from "@/lib/volunteers/client-actions";
import { buildProgrammingOccurrenceDates } from "@/lib/volunteers/recurrence";
import type {
  VolunteerDashboardData,
  VolunteerProgramming,
  VolunteerProgrammingKind,
  VolunteerProgrammingOccurrence,
  VolunteerRecurrenceFrequency,
} from "@/lib/volunteers/types";
import { EscalaCultoDrawer } from "./components/escala-culto-drawer";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const KIND_LABELS: Record<VolunteerProgrammingKind, string> = {
  service: "Culto",
  cleaning: "Faxina",
  rehearsal: "Ensaio",
  meeting: "Reunião",
  outreach: "Ação",
  other: "Outro",
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
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array(first.getDay()).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
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
  onSaved,
}: {
  data: VolunteerDashboardData;
  open: boolean;
  initial: WizardForm;
  onOpenChange: (open: boolean) => void;
  onSaved: (eventId: string | null, startsAt: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initial);
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  function addPosition() {
    const selectedRoleIds = new Set(form.positions.map((item) => item.roleId));
    const department = data.departments.find(
      (item) =>
        item.active &&
        item.roles?.some(
          (role) => role.active && !selectedRoleIds.has(role.id),
        ),
    );
    const role = department?.roles?.find(
      (item) => item.active && !selectedRoleIds.has(item.id),
    );
    if (!department || !role)
      return toast.error("Todas as funções disponíveis já foram adicionadas");
    setForm({
      ...form,
      positions: [
        ...form.positions,
        {
          departmentId: department.id,
          roleId: role.id,
          requiredVolunteers: 1,
          instructions: role.instructions,
        },
      ],
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
    if (
      step === 1 &&
      form.recurrenceFrequency === "weekly" &&
      form.recurrenceWeekdays.length === 0
    )
      return toast.error("Escolha ao menos um dia");
    if (step === 2 && form.positions.length === 0)
      return toast.error("Inclua ao menos uma equipe e função");
    setStep(Math.min(3, step + 1));
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
    if (!result.ok)
      return toast.error(result.error ?? "Programação não foi salva");
    const info = result.data as
      { skippedPublished?: number; eventId?: string } | undefined;
    toast.success(
      form.editScope === "occurrence"
        ? "Ocorrência atualizada"
        : "Programação salva. Agora escolha as pessoas de cada data.",
    );
    if (info?.skippedPublished)
      toast.info(
        `${info.skippedPublished} escala(s) publicada(s) preservada(s)`,
      );
    onOpenChange(false);
    router.refresh();
    onSaved(info?.eventId ?? form.occurrenceEventId, form.startsAt);
  }

  const stepTitles = ["Atividade e data", "Equipes e vagas", "Revisão"];
  const occurrencePreview = buildProgrammingOccurrenceDates({
    startDate: form.startsAt.slice(0, 10),
    frequency:
      form.editScope === "occurrence" ? "none" : form.recurrenceFrequency,
    weekdays: form.recurrenceWeekdays,
    until: form.recurrenceUntil || null,
    horizonDays: 90,
  }).slice(0, 3);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-dvh max-h-dvh w-full max-w-none rounded-none overflow-y-auto sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-xl"
        data-testid="programming-wizard"
      >
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Editar programação" : "Nova escala"}
          </DialogTitle>
          <DialogDescription>
            Etapa {step} de 3 · {stepTitles[step - 1]}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {stepTitles.map((title, index) => (
            <div key={title} className="space-y-1">
              <div
                className={`h-1.5 rounded-full ${step >= index + 1 ? "bg-primary" : "bg-muted"}`}
              />
              <p className="text-center text-xs text-muted-foreground">
                {title}
              </p>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="activity-title">Título *</Label>
              <Input
                id="activity-title"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Ex.: Culto domingo 18h"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-kind">Tipo</Label>
              <select
                id="activity-kind"
                className="h-10 w-full rounded-md border bg-background px-3"
                value={form.kind}
                onChange={(event) =>
                  setForm({
                    ...form,
                    kind: event.target.value as VolunteerProgrammingKind,
                  })
                }
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-date">Data e horário *</Label>
              <Input
                id="activity-date"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm({ ...form, startsAt: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-duration">Duração em minutos</Label>
              <Input
                id="activity-duration"
                type="number"
                min="1"
                max="1440"
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    durationMinutes: Number(event.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-location">Local</Label>
              <Input
                id="activity-location"
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
                }
                placeholder="Templo principal"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="activity-description">Descrição</Label>
              <Textarea
                id="activity-description"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 py-2">
            {form.editScope === "occurrence" ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                Mudança vale somente para esta ocorrência.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Repetição</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["none", "weekly", "monthly"] as const).map(
                      (frequency) => (
                        <Button
                          key={frequency}
                          type="button"
                          variant={
                            form.recurrenceFrequency === frequency
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setForm({ ...form, recurrenceFrequency: frequency })
                          }
                        >
                          {frequency === "none"
                            ? "Uma vez"
                            : frequency === "weekly"
                              ? "Toda semana"
                              : "Todo mês"}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
                {form.recurrenceFrequency === "weekly" && (
                  <div className="space-y-2">
                    <Label>Dias da semana</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day, weekday) => (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={
                            form.recurrenceWeekdays.includes(weekday)
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setForm({
                              ...form,
                              recurrenceWeekdays:
                                form.recurrenceWeekdays.includes(weekday)
                                  ? form.recurrenceWeekdays.filter(
                                      (item) => item !== weekday,
                                    )
                                  : [
                                      ...form.recurrenceWeekdays,
                                      weekday,
                                    ].sort(),
                            })
                          }
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {form.recurrenceFrequency !== "none" && (
                  <div className="max-w-xs space-y-2">
                    <Label>Termina em (opcional)</Label>
                    <Input
                      type="date"
                      value={form.recurrenceUntil}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          recurrenceUntil: event.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Vazio = sem término.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                <option value="">Copiar modelo existente</option>
                {data.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!templateId}
                onClick={applyTemplate}
              >
                Aplicar modelo
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Equipes, funções e quantidades</p>
                <p className="text-xs text-muted-foreground">
                  Aqui você define as vagas. Depois, peça sugestões e revise as
                  pessoas de cada data.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addPosition}>
                <Plus className="mr-2 h-4 w-4" />
                Função
              </Button>
            </div>

            {/* Visual Team Quick-Add Toolbar */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Adicionar rapidamente por equipe:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.departments
                  .filter(
                    (item) =>
                      item.active && (item.roles ?? []).some((r) => r.active),
                  )
                  .map((dept) => {
                    const availableRoles = (dept.roles ?? []).filter(
                      (r) =>
                        r.active &&
                        !form.positions.some((p) => p.roleId === r.id),
                    );
                    if (availableRoles.length === 0) return null;
                    return (
                      <div
                        key={dept.id}
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        <span className="font-medium text-foreground">
                          {dept.name}:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {availableRoles.slice(0, 3).map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              className="rounded px-1.5 py-0.5 text-[11px] bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                              onClick={() => {
                                setForm({
                                  ...form,
                                  positions: [
                                    ...form.positions,
                                    {
                                      departmentId: dept.id,
                                      roleId: r.id,
                                      requiredVolunteers: 1,
                                      instructions: r.instructions,
                                    },
                                  ],
                                });
                              }}
                            >
                              + {r.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-2">
              {form.positions.map((position, index) => {
                const department = data.departments.find(
                  (item) => item.id === position.departmentId,
                );
                return (
                  <div
                    key={`${position.roleId}-${index}`}
                    className="grid gap-2 rounded-lg border bg-card/60 p-3 md:grid-cols-[1fr_1fr_140px_auto] items-center"
                  >
                    <select
                      className="h-9 rounded-md border bg-background px-2.5 text-xs font-medium"
                      value={position.departmentId}
                      onChange={(event) => {
                        const nextDepartment = data.departments.find(
                          (item) => item.id === event.target.value,
                        );
                        const selectedRoleIds = new Set(
                          form.positions
                            .filter((_, current) => current !== index)
                            .map((item) => item.roleId),
                        );
                        const role = nextDepartment?.roles?.find(
                          (item) =>
                            item.active && !selectedRoleIds.has(item.id),
                        );
                        if (!role)
                          return toast.error(
                            "Esta equipe não possui outra função disponível",
                          );
                        setForm({
                          ...form,
                          positions: form.positions.map((item, current) =>
                            current === index
                              ? {
                                  ...item,
                                  departmentId: event.target.value,
                                  roleId: role?.id ?? "",
                                  instructions: role?.instructions ?? "",
                                }
                              : item,
                          ),
                        });
                      }}
                    >
                      {data.departments
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2.5 text-xs"
                      value={position.roleId}
                      onChange={(event) => {
                        const role = department?.roles?.find(
                          (item) => item.id === event.target.value,
                        );
                        setForm({
                          ...form,
                          positions: form.positions.map((item, current) =>
                            current === index
                              ? {
                                  ...item,
                                  roleId: event.target.value,
                                  instructions: role?.instructions ?? "",
                                }
                              : item,
                          ),
                        });
                      }}
                    >
                      {(department?.roles ?? [])
                        .filter((item) => item.active)
                        .map((role) => (
                          <option
                            key={role.id}
                            value={role.id}
                            disabled={form.positions.some(
                              (item, current) =>
                                current !== index && item.roleId === role.id,
                            )}
                          >
                            {role.name}
                          </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 text-xs"
                        disabled={position.requiredVolunteers <= 1}
                        onClick={() =>
                          setForm({
                            ...form,
                            positions: form.positions.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    requiredVolunteers: Math.max(
                                      1,
                                      item.requiredVolunteers - 1,
                                    ),
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        -
                      </Button>
                      <Input
                        aria-label="Quantidade"
                        type="number"
                        min="1"
                        max="100"
                        className="h-8 text-center text-xs"
                        value={position.requiredVolunteers}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            positions: form.positions.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    requiredVolunteers:
                                      Number(event.target.value) || 1,
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 text-xs"
                        onClick={() =>
                          setForm({
                            ...form,
                            positions: form.positions.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    requiredVolunteers:
                                      item.requiredVolunteers + 1,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remover função"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setForm({
                          ...form,
                          positions: form.positions.filter(
                            (_, current) => current !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
            {form.positions.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Adicione equipe e função clicando nos botões acima.
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Programação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{form.title}</p>
                <p>
                  {KIND_LABELS[form.kind]} ·{" "}
                  {formatDate(new Date(form.startsAt).toISOString())}
                </p>
                <p>
                  {form.durationMinutes} min{" "}
                  {form.location ? `· ${form.location}` : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recorrência</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {form.editScope === "occurrence"
                  ? "Somente esta ocorrência"
                  : form.recurrenceFrequency === "none"
                    ? "Uma vez"
                    : form.recurrenceFrequency === "weekly"
                      ? `Semanal: ${form.recurrenceWeekdays.map((day) => WEEKDAYS[day]).join(", ")}`
                      : "Mensal no mesmo dia"}
                {form.recurrenceUntil && (
                  <p>
                    Até{" "}
                    {new Date(
                      `${form.recurrenceUntil}T12:00:00`,
                    ).toLocaleDateString("pt-BR")}
                  </p>
                )}
                {occurrencePreview.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Próximas:{" "}
                    {occurrencePreview
                      .map((date) =>
                        new Date(`${date}T12:00:00`).toLocaleDateString(
                          "pt-BR",
                        ),
                      )
                      .join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Equipe</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {form.positions.map((position) => {
                  const department = data.departments.find(
                    (item) => item.id === position.departmentId,
                  );
                  const role = department?.roles?.find(
                    (item) => item.id === position.roleId,
                  );
                  return (
                    <Badge key={position.roleId} variant="secondary">
                      {department?.name} · {role?.name} ·{" "}
                      {position.requiredVolunteers}
                    </Badge>
                  );
                })}
              </CardContent>
            </Card>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">
              Salvar cria as vagas, sem escolher pessoas. Em seguida, use
              Sugerir pessoas e revise a escala. Nenhum aviso será enviado antes
              da publicação.
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1 || saving}
            onClick={() => setStep(step - 1)}
          >
            Voltar
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={next}>
              Continuar
            </Button>
          ) : (
            <Button type="button" disabled={saving} onClick={save}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar e montar escala
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VolunteerProgrammingWorkspace({
  data,
}: {
  data: VolunteerDashboardData;
}) {
  const router = useRouter();
  const { params, navigate } = useVolunteerNavigation();
  const monthValue = workspaceMonth(params.get("month"));
  const month = new Date(`${monthValue}-01T12:00:00`);
  const view = params.get("view") === "calendar" ? "calendar" : "list";
  const drawerEventId = params.get("scale");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardForm, setWizardForm] = useState<WizardForm>(emptyForm());
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const events = useMemo(() => buildWorkspaceEvents(data), [data]);
  const monthItems = events.filter((event) => sameMonth(event.startsAt, month));
  const selectedReady = selected.filter((id) =>
    monthItems.some(
      (item) =>
        item.id === id &&
        !item.published &&
        item.required > 0 &&
        item.missing === 0,
    ),
  );
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(month);
  function openSchedule(id: string) {
    navigate({ scale: id });
  }
  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    navigate({ month: monthKey(next).slice(0, 7), scale: null });
    setSelected([]);
  }
  function openNew() {
    setWizardForm(emptyForm());
    setWizardKey((key) => key + 1);
    setWizardOpen(true);
  }
  function openEdit(
    programming: VolunteerProgramming,
    occurrence?: VolunteerProgrammingOccurrence,
  ) {
    setWizardForm(formFromProgramming(programming, occurrence));
    setWizardKey((key) => key + 1);
    setWizardOpen(true);
  }
  async function prepareMonth() {
    setWorking(true);
    try {
      const result = await prepareVolunteerProgrammingMonth(monthKey(month));
      if (!result.ok)
        return toast.error(
          result.error ?? "Não foi possível preparar o mês. Tente novamente.",
        );
      toast.success(
        "Vagas do mês preparadas. Abra cada escala para sugerir pessoas e revisar.",
      );
      router.refresh();
    } finally {
      setWorking(false);
    }
  }
  async function publishSelected() {
    setWorking(true);
    try {
      const result = await publishVolunteerProgrammingEvents(selectedReady);
      if (!result.ok)
        toast.error(
          result.error ??
            "Algumas escalas não foram publicadas. Revise e tente novamente.",
        );
      else
        toast.success(
          "Escalas publicadas. Avisos adicionados à fila de envio.",
        );
      setSelected([]);
      router.refresh();
    } finally {
      setWorking(false);
    }
  }
  async function removeProgramming(programming: VolunteerProgramming) {
    if (
      !window.confirm(
        `Excluir "${programming.title}"? Rascunhos futuros serão removidos. Escalas publicadas e histórico serão preservados.`,
      )
    )
      return;
    setWorking(true);
    try {
      const result = await deleteVolunteerProgramming(programming.id);
      if (!result.ok)
        return toast.error(
          result.error ?? "Não foi possível excluir a programação.",
        );
      toast.success(
        "Programação excluída. Escalas publicadas e histórico preservados.",
      );
      router.refresh();
    } finally {
      setWorking(false);
    }
  }
  const openedProgramming = data.programmings.find((item) =>
    item.occurrences.some((occurrence) => occurrence.eventId === drawerEventId),
  );
  const missingSlots = monthItems.reduce((sum, item) => sum + item.missing, 0);
  const awaitingSlots = monthItems.reduce((sum, item) => sum + item.awaiting, 0);
  const openSwaps = monthItems.reduce((sum, item) => sum + item.swaps, 0);
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Escalas"
        description="Escolha a atividade, monte a equipe e acompanhe as respostas."
        action={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nova escala
          </Button>
        }
      />
      <MetricGrid columns={3}>
        <MetricCard
          title="Vagas para preencher"
          value={missingSlots}
          icon={UserPlus}
          tone={missingSlots > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          title="Aguardando resposta"
          value={awaitingSlots}
          icon={Clock}
          tone="info"
        />
        <MetricCard
          title="Trocas em andamento"
          value={openSwaps}
          icon={ArrowLeftRight}
          tone="info"
        />
      </MetricGrid>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Mês anterior"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base capitalize">
                {monthLabel}
              </CardTitle>
              <Button
                variant="outline"
                size="icon"
                aria-label="Próximo mês"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={view === "list" ? "secondary" : "outline"}
                aria-pressed={view === "list"}
                onClick={() => navigate({ view: "list" })}
              >
                Lista
              </Button>
              <Button
                variant={view === "calendar" ? "secondary" : "outline"}
                aria-pressed={view === "calendar"}
                onClick={() => navigate({ view: "calendar" })}
              >
                Calendário
              </Button>
              {selectedReady.length > 0 && (
                <Button disabled={working} onClick={publishSelected}>
                  <Send className="mr-2 h-4 w-4" />
                  Publicar selecionadas ({selectedReady.length})
                </Button>
              )}
            </div>
          </div>
          {view === "calendar" && (
            <div className="space-y-1">
              <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthCells(month).map((day, index) =>
                  day === null ? (
                    <div key={`empty-${index}`} />
                  ) : (
                    <div
                      key={day}
                      className="min-h-20 min-w-0 rounded-md border p-1 text-xs"
                    >
                      <span>{day}</span>
                      {monthItems
                        .filter(
                          (item) => new Date(item.startsAt).getDate() === day,
                        )
                        .map((item) => (
                          <button
                            key={item.id}
                            className="mt-1 block w-full truncate rounded bg-primary/10 p-1 text-left text-primary focus-visible:outline-2"
                            onClick={() => openSchedule(item.id)}
                            title={item.title}
                          >
                            {item.title}
                          </button>
                        ))}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {monthItems.map((item) => (
            <article
              key={item.id}
              className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center"
            >
              {!item.published &&
                item.required > 0 &&
                item.missing === 0 &&
                !item.id.startsWith("shift:") && (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Selecionar ${item.title}`}
                    checked={selectedReady.includes(item.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />
                )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{item.title}</h3>
                  <Badge variant={item.published ? "default" : "outline"}>
                    {item.published
                      ? "Publicada"
                      : item.required === 0
                        ? "Definir equipe"
                        : item.missing > 0
                          ? "Em montagem"
                          : "Pronta para publicar"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(item.startsAt)}
                </p>
                <p className="text-sm">
                  {item.assigned}/{item.required} vagas preenchidas ·{" "}
                  {item.confirmed} confirmações
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.missing > 0 && (
                    <Badge variant="outline">
                      Faltam {item.missing} pessoas
                    </Badge>
                  )}
                  {item.awaiting > 0 && (
                    <Badge variant="secondary">
                      {item.awaiting} aguardando resposta
                    </Badge>
                  )}
                  {item.declined > 0 && (
                    <Badge variant="outline">{item.declined} recusas</Badge>
                  )}
                  {item.swaps > 0 && (
                    <Badge variant="secondary">
                      {item.swaps} trocas para acompanhar
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant={item.published ? "outline" : "default"}
                onClick={() => openSchedule(item.id)}
              >
                {item.swaps
                  ? "Revisar trocas"
                  : item.missing
                    ? "Completar equipe"
                    : item.published
                      ? "Acompanhar escala"
                      : item.required === 0
                        ? "Definir equipe"
                        : "Revisar e publicar"}
              </Button>
            </article>
          ))}
          {monthItems.length === 0 && (
            <div className="space-y-3 py-10 text-center">
              <CalendarDays className="mx-auto h-9 w-9 text-muted-foreground" />
              <p>Nenhuma atividade neste mês.</p>
              <Button variant="outline" onClick={openNew}>
                Criar primeira escala do mês
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium">
          Atividades recorrentes e modelos de programação
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Prepare novas datas e ajuste a repetição. Escalas publicadas são
            preservadas.
          </p>
          <Button variant="outline" disabled={working} onClick={prepareMonth}>
            Preparar datas deste mês
          </Button>
          {data.programmings.map((programming) => (
            <div
              key={programming.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{programming.title}</p>
                <p className="text-sm text-muted-foreground">
                  {programming.recurrenceFrequency === "none"
                    ? "Uma vez"
                    : programming.recurrenceFrequency === "weekly"
                      ? "Semanal"
                      : "Mensal"}
                </p>
                {programming.recurrenceNeedsReview && (
                  <Badge variant="outline">Revisar repetição</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => openEdit(programming)}>
                  Editar repetição
                </Button>
                {data.canAdminDelete && (
                  <Button
                    variant="ghost"
                    disabled={working}
                    onClick={() => removeProgramming(programming)}
                  >
                    Excluir
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
      <Wizard
        key={wizardKey}
        data={data}
        open={wizardOpen}
        initial={wizardForm}
        onOpenChange={setWizardOpen}
        onSaved={(id, startsAt) =>
          navigate({ month: startsAt.slice(0, 7), scale: id })
        }
      />
      <EscalaCultoDrawer
        key={drawerEventId}
        eventId={drawerEventId}
        open={drawerEventId !== null}
        onOpenChange={(open) => !open && navigate({ scale: null })}
        data={data}
        onEditActivity={
          openedProgramming
            ? () =>
                openEdit(
                  openedProgramming,
                  openedProgramming.occurrences.find(
                    (item) => item.eventId === drawerEventId,
                  ),
                )
            : undefined
        }
      />
    </div>
  );
}
