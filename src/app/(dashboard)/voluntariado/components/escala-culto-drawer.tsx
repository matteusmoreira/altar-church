"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
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
} from "@/lib/volunteers/v2-actions";
import { saveVolunteerAssignment } from "@/lib/volunteers/actions";
import type {
  VolunteerDashboardData,
  VolunteerShift,
} from "@/lib/volunteers/types";
import {
  CandidatePanel,
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
}: {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VolunteerDashboardData;
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
      .filter((s) => s.eventId === eventId);
  }, [data.schedules, eventId]);

  // Event Plan & Occurrence info
  const eventPlan = useMemo(() => {
    if (!eventId) return null;
    return data.eventPlans.find((p) => p.eventId === eventId);
  }, [data.eventPlans, eventId]);

  const occurrenceInfo = useMemo(() => {
    if (!eventId) return null;
    for (const p of data.programmings) {
      const found = p.occurrences.find((o) => o.eventId === eventId);
      if (found) return { programming: p, occurrence: found };
    }
    return null;
  }, [data.programmings, eventId]);

  // First shift for metadata
  const firstShift = eventShifts[0];
  const title = occurrenceInfo?.programming.title ?? firstShift?.eventTitle ?? "Escala do Culto";
  const startsAt = occurrenceInfo?.occurrence.startsAt ?? firstShift?.startsAt;
  const location = occurrenceInfo?.programming.location;
  const schedule = data.schedules.find((s) => s.shifts.some((shift) => shift.eventId === eventId));
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
  const isComplete = totalRequired > 0 && totalAssigned >= totalRequired;
  const isPublished = Boolean(
    eventPlan?.schedulePublishedAt || occurrenceInfo?.occurrence.status === "published",
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
    if (ok(result, "Escala do culto publicada e convites enviados aos voluntários!")) {
      router.refresh();
    }
  }

  async function handleSmart() {
    if (!scheduleId) return;
    setSmartLoading(true);
    const result = await generateSmartVolunteerSchedule(scheduleId);
    setSmartLoading(false);
    if (
      ok(
        result,
        `Sugestões inteligentes adicionadas em ${(result.data as { created?: number })?.created ?? 0} vaga(s) vazia(s)`,
      )
    ) {
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
          className="w-full sm:max-w-2xl overflow-y-auto p-6 space-y-6"
        >
          <SheetHeader className="space-y-2 border-b pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl font-bold">{title}</SheetTitle>
                <Badge variant={isPublished ? "default" : isComplete ? "secondary" : "outline"}>
                  {isPublished
                    ? "Escala Publicada"
                    : isComplete
                      ? "Pronta para Publicar"
                      : "Vagas Pendentes"}
                </Badge>
              </div>
              {data.canAdminDelete && eventId && (
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
                  Escala publicada — voluntários já foram avisados
                </div>
              ) : (
                <Button
                  disabled={!isComplete || publishing}
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

              {scheduleId && !isPublished && (
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
                  Sugerir com IA
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Body: Groups by Department */}
          {eventShifts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <AlertCircle className="mx-auto h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">Nenhum turno cadastrado para este culto.</p>
              <p className="text-xs">
                As equipes e funções podem ser configuradas editando a programação do culto.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(shiftsByDepartment.entries()).map(([departmentName, shifts]) => (
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
                            (a) => !["declined", "cancelled"].includes(a.status),
                          ).length,
                        0,
                      )}
                      /
                      {shifts.reduce((sum, s) => sum + s.requiredVolunteers, 0)} vagas
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
                                    activeAssignments.length >= shift.requiredVolunteers
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="text-[11px] px-1.5 py-0"
                                >
                                  {activeAssignments.length}/{shift.requiredVolunteers}
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
                                <span className="text-muted-foreground">·</span>
                                <span className="text-[11px] text-muted-foreground">
                                  {assignmentStatusLabels[assignment.status] ??
                                    assignment.status}
                                </span>
                                <button
                                  type="button"
                                  className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                                  aria-label={`Remover ${assignment.volunteerName}`}
                                  title="Remover voluntário"
                                  onClick={() =>
                                    removeAssignment(shift.id, assignment.volunteerId)
                                  }
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}

                            {/* Missing slots indicators */}
                            {Array.from({ length: missingCount }).map((_, idx) => (
                              <div
                                key={`missing-${shift.id}-${idx}`}
                                className="flex items-center gap-1 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300"
                              >
                                <span className="italic">Vaga aberta</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
              {title} {startsAt ? `· ${fmt(startsAt)}` : ""}.
              As pessoas escaladas, mensagens e registros vinculados serão apagados.
              Avisos já entregues não podem ser desfeitos. O evento e a programação serão mantidos.
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
