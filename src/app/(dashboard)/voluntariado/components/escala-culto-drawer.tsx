"use client";

import { summarizeShifts } from "@/lib/volunteers/workspace";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  publishVolunteerEventSchedule,
  generateSmartVolunteerSchedule,
  deleteVolunteerEventSchedule,
} from "@/lib/volunteers/client-actions";
import { saveVolunteerAssignment } from "@/lib/volunteers/client-actions";
import type {
  VolunteerDashboardData,
  VolunteerShift,
} from "@/lib/volunteers/types";
import {
  CandidatePanel,
  ManagerWorship,
  ManagerSwaps,
  ShiftChat,
  assignmentStatusLabels,
  fmt,
  ok,
} from "../volunteer-v2-workspace";

export function EscalaCultoDrawer({
  eventId,
  open,
  onOpenChange,
  data,
  onEditActivity,
}: {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VolunteerDashboardData;
  onEditActivity?: () => void;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // All shifts for this event across schedules
  const eventShifts = useMemo(() => {
    if (!eventId) return [];
    return data.schedules
      .flatMap((s) => s.shifts)
      .filter((s) => s.eventId === eventId || `shift:${s.id}` === eventId);
  }, [data.schedules, eventId]);

  // Event Plan & Occurrence info
  const eventPlan = useMemo(() => {
    if (!eventId) return null;
    return data.eventPlans.find((p) => p.eventId === eventId);
  }, [data.eventPlans, eventId]);

  const programming = data.programmings.find((item) =>
    item.occurrences.some((occurrence) => occurrence.eventId === eventId),
  );
  const occurrence = programming?.occurrences.find(
    (item) => item.eventId === eventId,
  );
  const occurrenceInfo =
    programming && occurrence ? { programming, occurrence } : null;

  // First shift for metadata
  const firstShift = eventShifts[0];
  const title =
    occurrenceInfo?.programming.title ??
    eventPlan?.eventTitle ??
    firstShift?.eventTitle ??
    "Escala";
  const startsAt =
    occurrenceInfo?.occurrence.startsAt ??
    eventPlan?.startsAt ??
    firstShift?.startsAt;
  const location = occurrenceInfo?.programming.location;
  const schedule = data.schedules.find((s) =>
    s.shifts.some((shift) => shift.eventId === eventId),
  );
  const scheduleId = schedule?.id;

  // Volunteer metrics
  const totalRequired = useMemo(
    () => eventShifts.reduce((acc, s) => acc + s.requiredVolunteers, 0),
    [eventShifts],
  );
  const totalAssigned = useMemo(
    () =>
      eventShifts.reduce(
        (acc, s) =>
          acc +
          s.assignments.filter(
            (a) => !["declined", "cancelled"].includes(a.status),
          ).length,
        0,
      ),
    [eventShifts],
  );
  const isComplete =
    totalRequired > 0 &&
    eventShifts.every(
      (shift) =>
        shift.assignments.filter(
          (item) => !["declined", "cancelled"].includes(item.status),
        ).length >= shift.requiredVolunteers,
    );
  const isPublished = Boolean(
    eventPlan?.schedulePublishedAt ||
      firstShift?.schedulePublishedAt ||
    occurrenceInfo?.occurrence.status === "published" ||
    (!eventPlan && !occurrenceInfo && schedule?.publishedAt),
  );

  const summary = summarizeShifts(eventShifts);
  const assignments = eventShifts.flatMap((shift) => shift.assignments);
  const deliveries = assignments.flatMap((item) => item.deliveries ?? []);
  const deliverySummary =
    deliveries.length === 0
      ? "Nenhum envio registrado para os canais habilitados."
      : `${deliveries.filter((item) => ["pending", "processing", "queued"].includes(item.status)).length} na fila · ${deliveries.filter((item) => item.status === "sent").length} enviados · ${deliveries.filter((item) => item.status === "delivered").length} entregues · ${deliveries.filter((item) => item.status === "failed").length} com falha`;
  const assignmentIds = new Set(assignments.map((item) => item.id));
  const swaps = data.swaps.filter((swap) =>
    assignmentIds.has(swap.assignmentId),
  );

  // Group shifts by department
  const shiftsByDepartment = useMemo(() => {
    const map = new Map<string, VolunteerShift[]>();
    for (const shift of eventShifts) {
      const current = map.get(shift.departmentName) ?? [];
      current.push(shift);
      map.set(shift.departmentName, current);
    }
    return map;
  }, [eventShifts]);

  async function handlePublish() {
    if (!eventId) return;
    setPublishing(true);
    const result = await publishVolunteerEventSchedule(eventId);
    setPublishing(false);
    if (ok(result, "Escala publicada. Avisos adicionados à fila de envio.")) {
      router.refresh();
    }
  }

  async function handleSmart() {
    if (!scheduleId || !eventId || eventId.startsWith("shift:")) return;
    setSmartLoading(true);
    const result = await generateSmartVolunteerSchedule(
      scheduleId,
      eventId ?? undefined,
    );
    setSmartLoading(false);
    if (
      ok(
        result,
        `Sugestões inteligentes adicionadas em ${(result.data as { created?: number })?.created ?? 0} vaga(s) vazia(s)`,
      )
    ) {
      const shortages = (result.data as { shortages?: number })?.shortages ?? 0;
      if (shortages > 0)
        toast.info(
          `${shortages} vaga(s) sem pessoa elegível. Use Escolher pessoas para consultar os motivos.`,
        );
      router.refresh();
    }
  }

  async function removeAssignment(shiftId: string, volunteerId: string) {
    if (
      ok(
        await saveVolunteerAssignment({
          shiftId,
          volunteerId,
          status: "cancelled",
        }),
        "Voluntário removido da vaga",
      )
    ) {
      router.refresh();
    }
  }

  async function handleDeleteSchedule() {
    if (!eventId) return;
    setDeleting(true);
    const result = await deleteVolunteerEventSchedule(eventId);
    setDeleting(false);
    if (ok(result, "Escala do evento excluída")) {
      setDeleteOpen(false);
      onOpenChange(false);
      router.refresh();
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full max-w-none sm:max-w-2xl overflow-y-auto p-4 pt-12 sm:p-6 sm:pt-12 space-y-6"
        >
          <SheetHeader className="space-y-2 border-b pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl font-bold">{title}</SheetTitle>
                <Badge
                  variant={
                    isPublished
                      ? "default"
                      : isComplete
                        ? "secondary"
                        : "outline"
                  }
                >
                  {isPublished
                    ? "Escala Publicada"
                    : isComplete
                      ? "Pronta para Publicar"
                      : "Vagas Pendentes"}
                </Badge>
              </div>
              {data.canAdminDelete &&
                eventId &&
                !eventId.startsWith("shift:") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Excluir Escala
                  </Button>
                )}
            </div>
            <SheetDescription className="space-y-1">
              <span className="flex flex-wrap items-center gap-4 text-xs">
                {startsAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {fmt(startsAt)}
                  </span>
                )}
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  {totalAssigned} de {totalRequired} vagas preenchidas
                </span>
              </span>
            </SheetDescription>

            {/* Visual Progress Bar */}
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Preenchimento da equipe</span>
                <span>
                  {totalRequired > 0
                    ? Math.round((totalAssigned / totalRequired) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isComplete ? "bg-emerald-500" : "bg-primary"
                  }`}
                  style={{
                    width: `${
                      totalRequired > 0
                        ? Math.min(100, (totalAssigned / totalRequired) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {isPublished ? (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-md">
                  <CheckCircle2 className="h-4 w-4" />
                  Escala publicada · acompanhe os avisos e as respostas abaixo
                </div>
              ) : (
                <Button
                  disabled={
                    !isComplete ||
                    publishing ||
                    Boolean(eventId?.startsWith("shift:"))
                  }
                  onClick={handlePublish}
                  className="w-full sm:w-auto"
                >
                  {publishing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {isComplete
                    ? "Publicar escala deste culto"
                    : "Preencha todas as vagas antes de publicar"}
                </Button>
              )}

              {scheduleId &&
                !isPublished &&
                eventId &&
                !eventId.startsWith("shift:") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={smartLoading}
                    onClick={handleSmart}
                  >
                    {smartLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Sugerir pessoas
                  </Button>
                )}
            </div>
          </SheetHeader>

          {isPublished &&
            eventShifts.some((shift) =>
              shift.assignments.some((item) => item.status === "proposed"),
            ) && (
              <Button
                disabled={!isComplete || publishing}
                onClick={handlePublish}
              >
                Publicar ajustes e avisar novos escalados
              </Button>
            )}
          {onEditActivity && !isPublished && (
            <Button variant="outline" onClick={onEditActivity}>
              Editar atividade e data
            </Button>
          )}
          {eventId && eventPlan && !isPublished && (
            <details
              className="rounded-xl border p-3"
              open={eventShifts.length === 0 ? true : undefined}
            >
              <summary className="cursor-pointer font-medium">
                Equipes, vagas e roteiro
              </summary>
              <div className="mt-3">
                <ManagerWorship
                  key={eventId}
                  data={data}
                  selectedEventId={eventId}
                />
              </div>
            </details>
          )}
          {isPublished && (
            <div className="rounded-lg border p-3 text-sm space-y-2">
              <p className="font-medium">Avisos da escala</p>
              <p>
                {summary.awaiting} aguardando resposta · {summary.confirmed}{" "}
                confirmações
              </p>
              <p className="text-muted-foreground">{deliverySummary}</p>
            </div>
          )}
          {swaps.length > 0 && <ManagerSwaps data={{ ...data, swaps }} />}
          {eventShifts.some((shift) =>
            shift.assignments.some((item) => item.status === "declined"),
          ) && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Recusas recebidas</p>
              {eventShifts.flatMap((shift) =>
                shift.assignments
                  .filter((item) => item.status === "declined")
                  .map((item) => (
                    <p key={item.id}>
                      {item.volunteerName} · {shift.roleName}:{" "}
                      {item.declineReason || "Sem motivo informado"}
                    </p>
                  )),
              )}
              <p className="mt-2 text-muted-foreground">
                Use Escolher pessoas na função correspondente para preencher a
                vaga.
              </p>
            </div>
          )}
          {/* Body: Groups by Department */}
          {eventShifts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <AlertCircle className="mx-auto h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">
                As vagas desta atividade ainda não foram preparadas.
              </p>
              <p className="text-xs">
                Defina as equipes acima e clique em Gerar rascunho.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(shiftsByDepartment.entries()).map(
                ([departmentName, shifts]) => (
                  <div
                    key={departmentName}
                    className="rounded-xl border bg-card/60 p-4 space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        {departmentName}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {shifts.reduce(
                          (sum, s) =>
                            sum +
                            s.assignments.filter(
                              (a) =>
                                !["declined", "cancelled"].includes(a.status),
                            ).length,
                          0,
                        )}
                        /
                        {shifts.reduce(
                          (sum, s) => sum + s.requiredVolunteers,
                          0,
                        )}{" "}
                        vagas
                      </span>
                    </div>

                    <div className="space-y-3">
                      {shifts.map((shift) => {
                        const activeAssignments = shift.assignments.filter(
                          (a) => !["declined", "cancelled"].includes(a.status),
                        );
                        const missingCount = Math.max(
                          0,
                          shift.requiredVolunteers - activeAssignments.length,
                        );

                        return (
                          <div
                            key={shift.id}
                            className="rounded-lg border bg-background/50 p-3 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {shift.roleName}
                                  </span>
                                  <Badge
                                    variant={
                                      activeAssignments.length >=
                                      shift.requiredVolunteers
                                        ? "default"
                                        : "secondary"
                                    }
                                    className="text-[11px] px-1.5 py-0"
                                  >
                                    {activeAssignments.length}/
                                    {shift.requiredVolunteers}
                                  </Badge>
                                </div>
                                {shift.instructions && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {shift.instructions}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CandidatePanel
                                  shift={shift}
                                  onAssigned={() => router.refresh()}
                                />
                                <ShiftChat
                                  shiftId={shift.id}
                                  unreadCount={shift.unreadChatCount}
                                />
                              </div>
                            </div>

                            {/* List of active volunteers in this shift */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {activeAssignments.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className="flex items-center gap-1.5 rounded-md border bg-muted/60 px-2.5 py-1 text-xs"
                                >
                                  <span className="font-medium">
                                    {assignment.volunteerName}
                                  </span>
                                  {assignment.scoreReasons.length > 0 && (
                                    <span className="text-muted-foreground">
                                      {assignment.scoreReasons
                                        .slice(0, 2)
                                        .map((reason) => reason.label)
                                        .join(" · ")}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground">
                                    ·
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {assignmentStatusLabels[
                                      assignment.status
                                    ] ?? assignment.status}
                                  </span>
                                  <button
                                    type="button"
                                    className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                                    aria-label={`Remover ${assignment.volunteerName}`}
                                    title="Remover voluntário"
                                    onClick={() =>
                                      removeAssignment(
                                        shift.id,
                                        assignment.volunteerId,
                                      )
                                    }
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}

                              {/* Missing slots indicators */}
                              {Array.from({ length: missingCount }).map(
                                (_, idx) => (
                                  <div
                                    key={`missing-${shift.id}-${idx}`}
                                    className="flex items-center gap-1 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300"
                                  >
                                    <span className="italic">Vaga aberta</span>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog to Delete Schedule */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => !deleting && setDeleteOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir escala deste culto?</AlertDialogTitle>
            <AlertDialogDescription>
              {title} {startsAt ? `· ${fmt(startsAt)}` : ""}. As pessoas
              escaladas, mensagens e registros vinculados serão apagados. Avisos
              já entregues não podem ser desfeitos. O evento e a programação
              serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDeleteSchedule()}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? "Excluindo..." : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
