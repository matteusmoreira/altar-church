"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  HeartHandshake,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { saveEvent } from "@/lib/operational/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  checkInVolunteerAssignment,
  saveVolunteer,
  saveVolunteerAssignment,
  saveVolunteerDepartment,
  saveVolunteerFeedPost,
  searchVolunteerPeople,
} from "@/lib/volunteers/actions";
import {
  acceptVolunteerSwap,
  checkOutVolunteerAssignment,
  generateVolunteerScheduleForEvent,
  generateSmartVolunteerSchedule,
  getVolunteerShiftCandidates,
  grantVolunteerRecognition,
  publishVolunteerEventSchedule,
  requestVolunteerSwap,
  respondVolunteerAssignment,
  reviewVolunteerSwap,
  saveMyVolunteerAvailability,
  saveMyVolunteerNotificationPreferences,
  saveVolunteerDepartmentRole,
  saveVolunteerServicePlan,
  saveVolunteerFeedback,
  saveVolunteerModuleSettings,
  saveVolunteerPushSubscription,
  sendVolunteerShiftMessage,
  softDeleteVolunteer,
  uploadVolunteerShiftFile,
} from "@/lib/volunteers/v2-actions";
import type {
  SchedulingCandidate,
  VolunteerActionResult,
  VolunteerDashboardData,
  VolunteerEventPlan,
  VolunteerNotificationPreferences,
  VolunteerPortalData,
  VolunteerPersonSuggestion,
  VolunteerShift,
} from "@/lib/volunteers/types";
import { VolunteerQrScanner } from "./volunteer-qr-scanner";

const fmt = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ok(result: VolunteerActionResult, success: string) {
  if (!result.ok) {
    toast.error(result.error ?? "Operação falhou");
    return false;
  }
  toast.success(success);
  return true;
}

function Metric({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  hint?: string;
  icon: typeof UsersRound;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="h-8 w-8 text-primary" />
      </CardContent>
    </Card>
  );
}

function Progress({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(bounded)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const positive = [
    "active",
    "published",
    "confirmed",
    "checked_in",
    "checked_out",
    "approved",
    "accepted",
  ].includes(status);
  const negative = [
    "declined",
    "cancelled",
    "no_show",
    "rejected",
    "failed",
  ].includes(status);
  return (
    <Badge
      variant={negative ? "destructive" : positive ? "default" : "secondary"}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function CandidatePanel({
  shift,
  onAssigned,
}: {
  shift: VolunteerShift;
  onAssigned: () => void;
}) {
  const [items, setItems] = useState<SchedulingCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    const result = await getVolunteerShiftCandidates(shift.id);
    setLoading(false);
    if (!result.ok || !Array.isArray(result.data))
      return toast.error(result.error ?? "Candidatos indisponíveis");
    setItems(result.data as SchedulingCandidate[]);
  }
  async function assign(volunteerId: string) {
    const result = await saveVolunteerAssignment({
      shiftId: shift.id,
      volunteerId,
      status: "proposed",
    });
    if (ok(result, "Voluntário escalado")) {
      setItems(null);
      onAssigned();
    }
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={load}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        Candidatos explicados
      </Button>
      {items && (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-2">
          {items.slice(0, 20).map((candidate) => (
            <div
              key={candidate.volunteerId}
              className="flex items-start justify-between gap-3 rounded-md border p-2"
            >
              <div>
                <p className="text-sm font-medium">
                  {candidate.volunteerName}{" "}
                  <Badge variant={candidate.eligible ? "default" : "secondary"}>
                    {candidate.eligible ? candidate.score : "bloqueado"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {candidate.eligible
                    ? candidate.reasons
                        .map(
                          (reason) =>
                            `${reason.label} ${reason.points >= 0 ? "+" : ""}${reason.points}`,
                        )
                        .join(" · ")
                    : candidate.blockers.join(" · ")}
                </p>
              </div>
              {candidate.eligible && (
                <Button size="sm" onClick={() => assign(candidate.volunteerId)}>
                  Escalar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftChat({ shiftId }: { shiftId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<
    {
      id: string;
      senderName: string;
      body: string;
      createdAt: string;
      files: { id: string; name: string; url?: string }[];
    }[]
  >([]);
  useEffect(() => {
    if (!open) return;
    const client = createClient();
    const channel = client
      .channel(`volunteer-shift-${shiftId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "volunteer_shift_messages",
        },
        () => {
          void fetch(`/api/v1/volunteers/shifts/${shiftId}/chat/messages`, {
            cache: "no-store",
          })
            .then((response) => response.json())
            .then((payload: { data?: typeof messages }) =>
              setMessages(payload.data ?? []),
            );
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [open, shiftId]);
  async function load() {
    const response = await fetch(
      `/api/v1/volunteers/shifts/${shiftId}/chat/messages`,
      { cache: "no-store" },
    );
    if (response.ok)
      setMessages(((await response.json()) as { data: typeof messages }).data);
  }
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }
  async function send() {
    setSending(true);
    const fileIds: string[] = [];
    if (file) {
      const payload = new FormData();
      payload.set("shiftId", shiftId);
      payload.set("file", file);
      const upload = await uploadVolunteerShiftFile(payload);
      if (!upload.ok || !upload.id) {
        setSending(false);
        return toast.error(upload.error ?? "Falha no anexo");
      }
      fileIds.push(upload.id);
    }
    const result = await sendVolunteerShiftMessage({
      shiftId,
      body,
      fileIds,
    });
    setSending(false);
    if (ok(result, "Mensagem enviada")) {
      setBody("");
      setFile(null);
      await load();
    }
  }
  return (
    <div>
      <Button type="button" size="sm" variant="ghost" onClick={toggle}>
        <MessageSquare className="mr-2 h-4 w-4" />
        Chat
      </Button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border p-3">
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem mensagens.</p>
            )}
            {messages.map((message) => (
              <div key={message.id} className="rounded-md bg-muted p-2 text-sm">
                <strong>{message.senderName}</strong>
                <p>{message.body}</p>
                {message.files.map((attachment) => (
                  <a
                    key={attachment.id}
                    className="mt-1 block text-xs text-primary underline"
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {attachment.name}
                  </a>
                ))}
                <span className="text-[10px] text-muted-foreground">
                  {fmt(message.createdAt)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Mensagem da escala"
              onKeyDown={(event) => {
                if (event.key === "Enter") void send();
              }}
            />
            <label
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Anexar arquivo</span>
              <input
                className="sr-only"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.mp4,.webm"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button size="sm" onClick={send} disabled={!body.trim() || sending}>
              Enviar
            </Button>
          </div>
          {file && (
            <p className="text-xs text-muted-foreground">Anexo: {file.name}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ManagerOverview({ data }: { data: VolunteerDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          title="Voluntários ativos"
          value={data.metrics.activeVolunteers}
          icon={UsersRound}
        />
        <Metric
          title="Escalados no mês"
          value={data.metrics.assignedThisMonth}
          icon={CalendarDays}
        />
        <Metric
          title="Vagas abertas"
          value={data.metrics.openVacancies}
          icon={ClipboardCheck}
        />
        <Metric
          title="Check-ins"
          value={data.metrics.checkinsThisMonth}
          icon={CheckCircle2}
        />
        <Metric
          title="Confirmação"
          value={`${data.reports.confirmationRate}%`}
          icon={UserRoundCheck}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cobertura por equipe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.reports.departmentCoverage.map((row) => {
              const coverage = row.required
                ? Math.min(100, Math.round((row.filled * 100) / row.required))
                : 100;
              return (
                <div key={row.departmentId}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{row.departmentName}</span>
                    <span>
                      {row.filled}/{row.required}
                    </span>
                  </div>
                  <Progress value={coverage} />
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cuidado pastoral</CardTitle>
            <CardDescription>Sinais privados; nunca ranking.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Metric
              title="Sobrecarregados"
              value={data.reports.overloadedVolunteers}
              icon={HeartHandshake}
            />
            <Metric
              title="Afastados 90 dias"
              value={data.reports.inactiveVolunteers}
              icon={UsersRound}
            />
            <Metric
              title="Trocas abertas"
              value={data.reports.openSwaps}
              icon={RefreshCw}
            />
            <Metric
              title="Falhas de entrega"
              value={data.reports.deliveryFailures}
              icon={Bell}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ManagerVolunteers({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [suggestions, setSuggestions] = useState<VolunteerPersonSuggestion[]>([]);
  const [selectedPerson, setSelectedPerson] =
    useState<VolunteerPersonSuggestion | null>(null);
  const [form, setForm] = useState<{
    id: string | null;
    personId: string;
    memberships: {
      departmentId: string;
      roleId: string;
      preferred: boolean;
    }[];
    invite: boolean;
  }>({ id: null, personId: "", memberships: [], invite: false });
  useEffect(() => {
    const query = personQuery.trim();
    if (selectedPerson || query.length < 3) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void searchVolunteerPeople(query).then((result) => {
        if (active) setSuggestions(result.people ?? []);
      });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [personQuery, selectedPerson]);
  const visible = data.volunteers.filter((item) =>
    `${item.name} ${item.email ?? ""} ${item.phone}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  function choosePerson(person: VolunteerPersonSuggestion) {
    const volunteer = data.volunteers.find(
      (item) => item.personId === person.id,
    );
    setSelectedPerson(person);
    setPersonQuery(person.fullName);
    setSuggestions([]);
    setForm({
      id: volunteer?.id ?? null,
      personId: person.id,
      memberships:
        volunteer?.memberships
          ?.filter((item) => item.roleId)
          .map((item) => ({
            departmentId: item.departmentId,
            roleId: item.roleId ?? "",
            preferred: Boolean(item.preferred),
          })) ?? [],
      invite: false,
    });
  }
  function resetForm() {
    setSelectedPerson(null);
    setPersonQuery("");
    setSuggestions([]);
    setForm({ id: null, personId: "", memberships: [], invite: false });
  }
  function addMembership() {
    const department = data.departments.find(
      (item) => item.active && (item.roles ?? []).some((role) => role.active),
    );
    const role = department?.roles?.find((item) => item.active);
    if (!department || !role)
      return toast.error("Crie uma equipe e uma função primeiro");
    if (
      form.memberships.some(
        (membership) => membership.roleId === role.id,
      )
    )
      return toast.error("Esta função já foi adicionada");
    setForm({
      ...form,
      memberships: [
        ...form.memberships,
        {
          departmentId: department.id,
          roleId: role.id,
          preferred: form.memberships.length === 0,
        },
      ],
    });
  }
  async function create() {
    if (!form.personId) return toast.error("Selecione uma Pessoa");
    if (form.memberships.length === 0)
      return toast.error("Adicione ao menos uma equipe e função");
    const result = await saveVolunteer({
      ...form,
      registrationStatus: "active",
      whatsappEnabled: true,
      emailEnabled: true,
    });
    if (ok(result, form.id ? "Voluntário atualizado" : "Voluntário salvo")) {
      resetForm();
      router.refresh();
    }
  }
  async function remove(id: string) {
    if (!window.confirm("Inativar este voluntário? Histórico será preservado."))
      return;
    if (ok(await softDeleteVolunteer(id), "Voluntário inativado"))
      router.refresh();
  }
  async function recognize(id: string, name: string) {
    if (
      ok(
        await grantVolunteerRecognition({
          volunteerId: id,
          kind: "thanks",
          title: "Obrigado por servir",
          message: `${name}, sua dedicação faz diferença.`,
          milestone: null,
        }),
        "Reconhecimento enviado",
      )
    )
      router.refresh();
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Novo voluntário</CardTitle>
          <CardDescription>
            Selecione uma Pessoa já cadastrada e defina onde ela serve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Digite ao menos 3 letras para buscar em Pessoas"
              value={personQuery}
              onChange={(e) => {
                setPersonQuery(e.target.value);
                if (e.target.value.trim().length < 3) setSuggestions([]);
                if (selectedPerson) {
                  setSelectedPerson(null);
                  setForm({ id: null, personId: "", memberships: [], invite: false });
                }
              }}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                {suggestions.map((person) => (
                  <button
                    type="button"
                    key={person.id}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => choosePerson(person)}
                  >
                    <span>
                      <strong>{person.fullName}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {(person.email ?? person.phone) || "Sem contato"}
                      </span>
                    </span>
                    <Badge variant={person.volunteerId ? "default" : "secondary"}>
                      {person.volunteerId ? "Já voluntário" : person.personType}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedPerson && (
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{selectedPerson.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedPerson.email ?? selectedPerson.phone) || "Sem contato"} ·{" "}
                    {selectedPerson.personType}
                  </p>
                </div>
                {form.id && <Badge>Vínculo existente</Badge>}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {form.memberships.map((membership, index) => {
              const department = data.departments.find(
                (item) => item.id === membership.departmentId,
              );
              return (
                <div
                  key={`${membership.roleId}-${index}`}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_auto_auto]"
                >
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    value={membership.departmentId}
                    onChange={(e) => {
                      const nextDepartment = data.departments.find(
                        (item) => item.id === e.target.value,
                      );
                      const nextRole = nextDepartment?.roles?.find((role) => role.active);
                      setForm({
                        ...form,
                        memberships: form.memberships.map((item, current) =>
                          current === index
                            ? {
                                ...item,
                                departmentId: e.target.value,
                                roleId: nextRole?.id ?? "",
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
                    className="h-10 rounded-md border bg-background px-3"
                    value={membership.roleId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        memberships: form.memberships.map((item, current) =>
                          current === index ? { ...item, roleId: e.target.value } : item,
                        ),
                      })
                    }
                  >
                    {(department?.roles ?? [])
                      .filter((role) => role.active)
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="preferredMembership"
                      checked={membership.preferred}
                      onChange={() =>
                        setForm({
                          ...form,
                          memberships: form.memberships.map((item, current) => ({
                            ...item,
                            preferred: current === index,
                          })),
                        })
                      }
                    />
                    Preferida
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        ...form,
                        memberships: form.memberships.filter((_, current) => current !== index),
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" onClick={addMembership}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar equipe e função
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.invite}
              onChange={(e) => setForm({ ...form, invite: e.target.checked })}
            />
            Convidar para portal
          </label>
          <div className="flex gap-2">
            <Button onClick={create}>
              <Plus className="mr-2 h-4 w-4" />
              {form.id ? "Atualizar vínculo" : "Salvar voluntário"}
            </Button>
            {selectedPerson && (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar nome, e-mail ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((volunteer) => (
          <Card key={volunteer.id}>
            <CardContent className="p-4">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">{volunteer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {volunteer.email ?? (volunteer.phone || "Sem contato")}
                  </p>
                </div>
                <StatusBadge status={volunteer.status} />
              </div>
              <p className="mt-3 text-sm">
                {volunteer.departmentNames.join(", ") || "Sem equipe"}
              </p>
              <p className="text-xs text-muted-foreground">
                {volunteer.checkins}/{volunteer.assignments} presenças · meta{" "}
                {volunteer.desiredServicesPerMonth}, limite{" "}
                {volunteer.maxServicesPerMonth}/mês
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    choosePerson({
                      id: volunteer.personId,
                      fullName: volunteer.name,
                      email: volunteer.email,
                      phone: volunteer.phone,
                      personType: "pessoa",
                      volunteerId: volunteer.id,
                    })
                  }
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => recognize(volunteer.id, volunteer.name)}
                >
                  <Award className="mr-1 h-4 w-4" />
                  Agradecer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(volunteer.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ManagerTeams({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  const [department, setDepartment] = useState<{
    id: string | null;
    name: string;
    description: string;
    active: boolean;
  }>({ id: null, name: "", description: "", active: true });
  const [role, setRole] = useState({
    id: null as string | null,
    departmentId: data.departments[0]?.id ?? "",
    name: "",
    description: "",
    instructions: "",
    active: true,
  });
  async function addDepartment() {
    const result = await saveVolunteerDepartment({
      managerProfileId: null,
      ...department,
    });
    if (ok(result, department.id ? "Equipe atualizada" : "Equipe criada")) {
      if (result.id) setRole((current) => ({ ...current, departmentId: result.id ?? "" }));
      setDepartment({ id: null, name: "", description: "", active: true });
      router.refresh();
    }
  }
  async function addRole() {
    if (!role.departmentId) return toast.error("Selecione uma equipe");
    const result = await saveVolunteerDepartmentRole({
      ...role,
    });
    if (ok(result, role.id ? "Função atualizada" : "Função criada")) {
      setRole({
        ...role,
        id: null,
        name: "",
        description: "",
        instructions: "",
        active: true,
      });
      router.refresh();
    }
  }
  async function toggleDepartment(item: VolunteerDashboardData["departments"][number]) {
    if (
      ok(
        await saveVolunteerDepartment({
          id: item.id,
          name: item.name,
          description: item.description,
          managerProfileId: item.managerProfileId,
          active: !item.active,
        }),
        item.active ? "Equipe inativada" : "Equipe reativada",
      )
    )
      router.refresh();
  }
  async function toggleRole(
    item: NonNullable<VolunteerDashboardData["departments"][number]["roles"]>[number],
  ) {
    if (
      ok(
        await saveVolunteerDepartmentRole({
          id: item.id,
          departmentId: item.departmentId,
          name: item.name,
          description: item.description,
          instructions: item.instructions,
          active: !item.active,
        }),
        item.active ? "Função inativada" : "Função reativada",
      )
    )
      router.refresh();
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Equipes e ministérios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Nome da equipe"
            value={department.name}
            onChange={(e) =>
              setDepartment({ ...department, name: e.target.value })
            }
          />
          <Textarea
            placeholder="Descrição"
            value={department.description}
            onChange={(e) =>
              setDepartment({ ...department, description: e.target.value })
            }
          />
          <div className="flex gap-2">
            <Button onClick={addDepartment}>
              {department.id ? "Salvar equipe" : "Criar equipe"}
            </Button>
            {department.id && (
              <Button
                variant="ghost"
                onClick={() =>
                  setDepartment({ id: null, name: "", description: "", active: true })
                }
              >
                Cancelar
              </Button>
            )}
          </div>
          <div className="space-y-2 pt-3">
            {data.departments.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex justify-between">
                  <strong>{item.name}</strong>
                  <StatusBadge status={item.active ? "active" : "inactive"} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.description || "Sem descrição"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDepartment({
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        active: item.active,
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleDepartment(item)}>
                    {item.active ? "Inativar" : "Reativar"}
                  </Button>
                </div>
                {(item.roles ?? []).length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {(item.roles ?? []).map((itemRole) => (
                      <div key={itemRole.id} className="rounded-md bg-muted/50 p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <strong>{itemRole.name}</strong>
                            {!itemRole.active && " · inativa"}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setRole({
                                  id: itemRole.id,
                                  departmentId: itemRole.departmentId,
                                  name: itemRole.name,
                                  description: itemRole.description,
                                  instructions: itemRole.instructions,
                                  active: itemRole.active,
                                })
                              }
                            >
                              Editar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleRole(itemRole)}>
                              {itemRole.active ? "Inativar" : "Reativar"}
                            </Button>
                          </div>
                        </div>
                        {itemRole.instructions && (
                          <p className="text-xs text-muted-foreground">{itemRole.instructions}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Funções e instruções</CardTitle>
          <CardDescription>
            Funções habilitam escala inteligente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={role.departmentId}
            onChange={(e) => setRole({ ...role, departmentId: e.target.value })}
          >
            {data.departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Função: Vocal, Recepção, Câmera…"
            value={role.name}
            onChange={(e) => setRole({ ...role, name: e.target.value })}
          />
          <Input
            placeholder="Descrição"
            value={role.description}
            onChange={(e) => setRole({ ...role, description: e.target.value })}
          />
          <Textarea
            placeholder="Instruções para quem servir"
            value={role.instructions}
            onChange={(e) => setRole({ ...role, instructions: e.target.value })}
          />
          <div className="flex gap-2">
            <Button onClick={addRole} disabled={!role.departmentId}>
              {role.id ? "Salvar função" : "Criar função"}
            </Button>
            {role.id && (
              <Button
                variant="ghost"
                onClick={() =>
                  setRole({
                    id: null,
                    departmentId: role.departmentId,
                    name: "",
                    description: "",
                    instructions: "",
                    active: true,
                  })
                }
              >
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ManagerSchedules({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  async function smart(id: string) {
    const result = await generateSmartVolunteerSchedule(id);
    if (
      ok(
        result,
        `Proposta criada: ${(result.data as { created?: number })?.created ?? 0} posições`,
      )
    )
      router.refresh();
  }
  async function publish(eventId: string) {
    if (
      ok(
        await publishVolunteerEventSchedule(eventId),
        "Escala do culto publicada e avisos enfileirados",
      )
    )
      router.refresh();
  }
  async function removeAssignment(shiftId: string, volunteerId: string) {
    if (
      ok(
        await saveVolunteerAssignment({
          shiftId,
          volunteerId,
          status: "cancelled",
        }),
        "Pessoa removida da vaga",
      )
    )
      router.refresh();
  }
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Rascunhos e escalas publicadas</h3>
        <p className="text-sm text-muted-foreground">
          Revise sugestões, faça trocas e publique quando estiver pronto.
        </p>
      </div>
      {data.schedules.map((schedule) => (
        <Card key={schedule.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{schedule.month.slice(0, 7)}</CardTitle>
                <CardDescription>
                  {schedule.shifts.length} posições
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => smart(schedule.id)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Recalcular vagas abertas
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {schedule.shifts.map((shift, shiftIndex) => {
              const active = shift.assignments.filter(
                (item) => !["declined", "cancelled"].includes(item.status),
              );
              const eventPlan = data.eventPlans.find(
                (plan) => plan.eventId === shift.eventId,
              );
              const firstForEvent =
                schedule.shifts.findIndex((item) => item.eventId === shift.eventId) ===
                shiftIndex;
              return (
                <div key={shift.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {shift.eventTitle} · {shift.departmentName} ·{" "}
                        {shift.roleName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(shift.startsAt)} · {shift.instructions}
                      </p>
                    </div>
                    <Badge
                      variant={
                        active.length >= shift.requiredVolunteers
                          ? "default"
                          : "secondary"
                      }
                    >
                      {active.length}/{shift.requiredVolunteers}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shift.assignments
                      .filter(
                        (assignment) =>
                          !["declined", "cancelled"].includes(assignment.status),
                      )
                      .map((assignment) => (
                      <div
                        key={assignment.id}
                        className="rounded-md bg-muted px-2 py-1 text-xs"
                      >
                        <strong>{assignment.volunteerName}</strong> ·{" "}
                        {assignment.status}
                        {assignment.score !== null &&
                          ` · ${assignment.score} pts`}
                        {assignment.locked && " · travado"}
                        {!["declined", "cancelled"].includes(assignment.status) && (
                          <button
                            type="button"
                            className="ml-2 text-destructive"
                            aria-label={`Remover ${assignment.volunteerName}`}
                            onClick={() =>
                              removeAssignment(shift.id, assignment.volunteerId)
                            }
                          >
                            <X className="inline h-3 w-3" />
                          </button>
                        )}
                      </div>
                      ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {firstForEvent && shift.eventId && (
                      eventPlan?.schedulePublishedAt ? (
                        <Badge>Escala do culto publicada</Badge>
                      ) : (
                        <Button onClick={() => publish(shift.eventId ?? "")}>
                          Publicar escala deste culto
                        </Button>
                      )
                    )}
                    <CandidatePanel
                      shift={shift}
                      onAssigned={() => router.refresh()}
                    />
                    <ShiftChat shiftId={shift.id} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function buildCalendarCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  return cells;
}

function ManagerWorship({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  const [eventId, setEventId] = useState(data.eventPlans[0]?.eventId ?? "");
  const selected = data.eventPlans.find((item) => item.eventId === eventId);
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [newServiceTitle, setNewServiceTitle] = useState("");
  const [newServiceStartsAt, setNewServiceStartsAt] = useState("");
  const [creatingService, setCreatingService] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [positions, setPositions] = useState<
    {
      departmentId: string;
      roleId: string;
      requiredVolunteers: number;
      instructions: string;
    }[]
  >([]);
  const [timeline, setTimeline] = useState<
    {
      title: string;
      plannedAt: string;
      durationMinutes: number;
      responsibleProfileId: string | null;
      instructions: string;
    }[]
  >([]);
  /* eslint-disable react-hooks/set-state-in-effect -- reset the editor when the selected event changes */
  useEffect(() => {
    setPositions(
      selected?.positions.map((item) => ({
        departmentId: item.departmentId,
        roleId: item.roleId,
        requiredVolunteers: item.requiredVolunteers,
        instructions: item.instructions,
      })) ?? [],
    );
    setTimeline(
      selected?.timeline.map((item) => ({
        title: item.title,
        plannedAt: item.plannedAt,
        durationMinutes: item.durationMinutes,
        responsibleProfileId: item.responsibleProfileId,
        instructions: item.instructions,
      })) ?? [],
    );
  }, [selected]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function addPosition() {
    const department = data.departments.find(
      (item) => item.active && (item.roles ?? []).some((role) => role.active),
    );
    const role = department?.roles?.find((item) => item.active);
    if (!department || !role)
      return toast.error("Crie uma equipe e uma função primeiro");
    if (positions.some((item) => item.roleId === role.id))
      return toast.error("Esta função já está no culto");
    setPositions([
      ...positions,
      {
        departmentId: department.id,
        roleId: role.id,
        requiredVolunteers: 1,
        instructions: role.instructions,
      },
    ]);
  }
  function applyModel() {
    const model = data.templates.find((item) => item.id === modelId);
    if (!model) return toast.error("Selecione um modelo");
    setPositions(
      model.slots.map((slot) => ({
        departmentId: slot.departmentId,
        roleId: slot.roleId,
        requiredVolunteers: slot.requiredVolunteers,
        instructions: slot.instructions,
      })),
    );
    toast.success("Modelo aplicado. Revise antes de salvar.");
  }
  async function createService() {
    if (!newServiceTitle.trim()) return toast.error("Informe o nome do culto");
    if (!newServiceStartsAt) return toast.error("Informe a data e o horário");
    setCreatingService(true);
    const formData = new FormData();
    formData.set("title", newServiceTitle.trim());
    formData.set("startDate", newServiceStartsAt);
    formData.set("type", "service");
    formData.set("status", "published");
    formData.set("isPublic", "true");
    const result = await saveEvent(formData);
    setCreatingService(false);
    if (!result.ok) return toast.error(result.error ?? "Não foi possível criar o culto");
    toast.success("Culto criado. Defina as equipes abaixo.");
    setNewServiceTitle("");
    setNewServiceStartsAt("");
    if (result.id) {
      setEventId(result.id);
      const startsAt = new Date(newServiceStartsAt);
      if (!Number.isNaN(startsAt.getTime()))
        setCalendarMonth(new Date(startsAt.getFullYear(), startsAt.getMonth(), 1));
    }
    router.refresh();
  }
  async function save(showSuccess = true) {
    if (!eventId) return toast.error("Selecione culto");
    if (positions.length === 0)
      return toast.error("Inclua ao menos uma equipe e função");
    const result = await saveVolunteerServicePlan({
      eventId,
      positions,
      timeline,
      modelName,
    });
    if (!result.ok) {
      toast.error(result.error ?? "Plano não foi salvo");
      return false;
    }
    if (showSuccess) toast.success("Planejamento salvo");
    setModelName("");
    router.refresh();
    return true;
  }
  async function generate() {
    if (!(await save(false))) return;
    const result = await generateVolunteerScheduleForEvent(eventId);
    if (
      ok(
        result,
        `Rascunho gerado: ${(result.data as { created?: number })?.created ?? 0} voluntários sugeridos`,
      )
    )
      router.refresh();
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cultos e escalas</CardTitle>
          <CardDescription>
            Escolha um culto, defina quem precisa servir e gere um rascunho para revisão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Novo culto</p>
            <div className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
              <Input
                placeholder="Nome do culto (ex.: Culto Domingo Manhã)"
                value={newServiceTitle}
                onChange={(e) => setNewServiceTitle(e.target.value)}
              />
              <Input
                type="datetime-local"
                aria-label="Data e horário do culto"
                value={newServiceStartsAt}
                onChange={(e) => setNewServiceStartsAt(e.target.value)}
              />
              <Button onClick={createService} disabled={creatingService}>
                {creatingService ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Criar culto
              </Button>
            </div>
          </div>
          {(() => {
            const eventsByDay = new Map<number, VolunteerEventPlan[]>();
            for (const plan of data.eventPlans) {
              const date = new Date(plan.startsAt);
              if (
                date.getFullYear() === calendarMonth.getFullYear() &&
                date.getMonth() === calendarMonth.getMonth()
              ) {
                const list = eventsByDay.get(date.getDate()) ?? [];
                list.push(plan);
                eventsByDay.set(date.getDate(), list);
              }
            }
            const monthLabel = new Intl.DateTimeFormat("pt-BR", {
              month: "long",
              year: "numeric",
            }).format(calendarMonth);
            return (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Mês anterior"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="text-sm font-medium capitalize">{monthLabel}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Próximo mês"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                  {weekdayNames.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {buildCalendarCells(calendarMonth).map((day, index) => {
                    if (day === null) return <div key={`empty-${index}`} />;
                    const dayEvents = eventsByDay.get(day) ?? [];
                    const isSelected = dayEvents.some((plan) => plan.eventId === eventId);
                    return (
                      <button
                        type="button"
                        key={day}
                        disabled={dayEvents.length === 0}
                        onClick={() => setEventId(dayEvents[0]?.eventId ?? "")}
                        title={dayEvents.map((plan) => plan.eventTitle).join(", ")}
                        className={`flex h-9 flex-col items-center justify-center rounded-md text-sm transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : dayEvents.length > 0
                              ? "bg-primary/10 font-medium hover:bg-primary/20"
                              : "text-muted-foreground"
                        }`}
                      >
                        {day}
                        {dayEvents.length > 0 && (
                          <span
                            className={`h-1 w-1 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                {data.eventPlans.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    Nenhum culto cadastrado. Crie o primeiro acima.
                  </p>
                )}
              </div>
            );
          })()}
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">Selecione o culto para planejar</option>
            {data.eventPlans.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventTitle} · {fmt(event.startsAt)}
              </option>
            ))}
          </select>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              <option value="">Aplicar modelo de equipes e funções</option>
              {data.templates.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={applyModel} disabled={!modelId}>
              Aplicar modelo
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">Equipes e funções necessárias</h3>
                <p className="text-xs text-muted-foreground">
                  Instruções da função são preenchidas automaticamente.
                </p>
              </div>
              <Button variant="outline" onClick={addPosition}>
                <Plus className="mr-2 h-4 w-4" />
                Função
              </Button>
            </div>
            {positions.map((position, index) => {
              const department = data.departments.find(
                (item) => item.id === position.departmentId,
              );
              return (
                <div
                  key={`${position.roleId}-${index}`}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_120px_auto]"
                >
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    value={position.departmentId}
                    onChange={(e) => {
                      const nextDepartment = data.departments.find(
                        (item) => item.id === e.target.value,
                      );
                      const nextRole = nextDepartment?.roles?.find((role) => role.active);
                      setPositions(
                        positions.map((item, current) =>
                          current === index
                            ? {
                                ...item,
                                departmentId: e.target.value,
                                roleId: nextRole?.id ?? "",
                                instructions: nextRole?.instructions ?? "",
                              }
                            : item,
                        ),
                      );
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
                    className="h-10 rounded-md border bg-background px-3"
                    value={position.roleId}
                    onChange={(e) => {
                      const nextRole = department?.roles?.find(
                        (role) => role.id === e.target.value,
                      );
                      setPositions(
                        positions.map((item, current) =>
                          current === index
                            ? {
                                ...item,
                                roleId: e.target.value,
                                instructions: nextRole?.instructions ?? item.instructions,
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    {(department?.roles ?? [])
                      .filter((role) => role.active)
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    aria-label="Quantidade necessária"
                    value={position.requiredVolunteers}
                    onChange={(e) =>
                      setPositions(
                        positions.map((item, current) =>
                          current === index
                            ? { ...item, requiredVolunteers: Number(e.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setPositions(positions.filter((_, current) => current !== index))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Textarea
                    className="md:col-span-4"
                    placeholder="Instruções para quem servir"
                    value={position.instructions}
                    onChange={(e) =>
                      setPositions(
                        positions.map((item, current) =>
                          current === index
                            ? { ...item, instructions: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">Roteiro do culto</h3>
                <p className="text-xs text-muted-foreground">
                  Opcional. Organize momentos, horários e responsáveis.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setTimeline([
                    ...timeline,
                    {
                      title: "Novo momento",
                      plannedAt: selected?.startsAt ?? new Date().toISOString(),
                      durationMinutes: 5,
                      responsibleProfileId: null,
                      instructions: "",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Momento
              </Button>
            </div>
            {timeline.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_190px_100px_1fr_auto]"
              >
                <Input
                  placeholder="Momento"
                  value={item.title}
                  onChange={(e) =>
                    setTimeline(
                      timeline.map((current, i) =>
                        i === index ? { ...current, title: e.target.value } : current,
                      ),
                    )
                  }
                />
                <Input
                  type="datetime-local"
                  value={item.plannedAt.slice(0, 16)}
                  onChange={(e) =>
                    setTimeline(
                      timeline.map((current, i) =>
                        i === index
                          ? { ...current, plannedAt: new Date(e.target.value).toISOString() }
                          : current,
                      ),
                    )
                  }
                />
                <Input
                  type="number"
                  min="1"
                  value={item.durationMinutes}
                  onChange={(e) =>
                    setTimeline(
                      timeline.map((current, i) =>
                        i === index
                          ? { ...current, durationMinutes: Number(e.target.value) }
                          : current,
                      ),
                    )
                  }
                />
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={item.responsibleProfileId ?? ""}
                  onChange={(e) =>
                    setTimeline(
                      timeline.map((current, i) =>
                        i === index
                          ? { ...current, responsibleProfileId: e.target.value || null }
                          : current,
                      ),
                    )
                  }
                >
                  <option value="">Sem responsável</option>
                  {data.volunteers
                    .filter((volunteer) => volunteer.profileId)
                    .map((volunteer) => (
                      <option key={volunteer.id} value={volunteer.profileId ?? ""}>
                        {volunteer.name}
                      </option>
                    ))}
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setTimeline(timeline.filter((_, current) => current !== index))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
                <Textarea
                  className="md:col-span-5"
                  placeholder="Instruções do momento"
                  value={item.instructions}
                  onChange={(e) =>
                    setTimeline(
                      timeline.map((current, i) =>
                        i === index
                          ? { ...current, instructions: e.target.value }
                          : current,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="Nome para salvar como modelo (opcional)"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            />
            <Button variant="outline" onClick={() => void save()}>
              Salvar planejamento
            </Button>
            <Button onClick={generate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar rascunho
            </Button>
          </div>
        </CardContent>
      </Card>
      <ManagerSchedules data={data} />
    </div>
  );
}

function ManagerCommunication({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    content: "",
    audience: "all" as "all" | "departments",
    departmentId: "",
  });
  async function publish() {
    const result = await saveVolunteerFeedPost({
      id: null,
      title: form.title,
      content: form.content,
      audience: form.audience,
      departmentIds:
        form.audience === "departments" && form.departmentId
          ? [form.departmentId]
          : [],
      publish: true,
    });
    if (ok(result, "Comunicado publicado")) {
      setForm({ title: "", content: "", audience: "all", departmentId: "" });
      router.refresh();
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Comunicado multicanal</CardTitle>
          <CardDescription>
            Portal + preferências WhatsApp, e-mail e push.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            placeholder="Mensagem"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <div className="flex gap-2">
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={form.audience}
              onChange={(e) =>
                setForm({
                  ...form,
                  audience: e.target.value as "all" | "departments",
                })
              }
            >
              <option value="all">Todos</option>
              <option value="departments">Equipe</option>
            </select>
            {form.audience === "departments" && (
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={form.departmentId}
                onChange={(e) =>
                  setForm({ ...form, departmentId: e.target.value })
                }
              >
                {data.departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={publish}>Publicar</Button>
          </div>
          <div className="space-y-2 pt-3">
            {data.feedPosts.map((post) => (
              <div key={post.id} className="rounded-lg border p-3">
                <strong>{post.title}</strong>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {post.content}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trocas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.swaps.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem solicitações.</p>
          )}
          {data.swaps.map((swap) => (
            <div key={swap.id} className="rounded-lg border p-3">
              <div className="flex justify-between">
                <StatusBadge status={swap.status} />
                <span className="text-xs text-muted-foreground">
                  {fmt(swap.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-sm">{swap.reason}</p>
              <p className="text-xs text-muted-foreground">
                Substituto: {swap.replacementName ?? "aguardando"}
              </p>
              {["open", "accepted"].includes(swap.status) && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (
                        ok(
                          await reviewVolunteerSwap(swap.id, true),
                          "Troca aprovada",
                        )
                      )
                        router.refresh();
                    }}
                    disabled={!swap.replacementVolunteerId}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (
                        ok(
                          await reviewVolunteerSwap(swap.id, false),
                          "Troca recusada",
                        )
                      )
                        router.refresh();
                    }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Recusar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ManagerReports({ data }: { data: VolunteerDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/api/v1/volunteers/reports/export"
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          title="Confirmação"
          value={`${data.reports.confirmationRate}%`}
          icon={CheckCircle2}
        />
        <Metric
          title="Presença"
          value={`${data.reports.attendanceRate}%`}
          icon={UserRoundCheck}
        />
        <Metric
          title="Recusas"
          value={`${data.reports.declineRate}%`}
          icon={X}
        />
        <Metric
          title="Faltas"
          value={`${data.reports.noShowRate}%`}
          icon={Bell}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cobertura operacional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.reports.departmentCoverage.map((row) => (
            <div
              key={row.departmentId}
              className="grid grid-cols-[1fr_auto] items-center gap-3"
            >
              <div>
                <p className="text-sm font-medium">{row.departmentName}</p>
                <Progress
                  value={
                    row.required
                      ? Math.min(100, (row.filled * 100) / row.required)
                      : 100
                  }
                />
              </div>
              <span className="text-sm">
                {row.filled}/{row.required}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ManagerSettings({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter();
  const [settings, setSettings] = useState({
    ...data.settings,
    reminderText: data.settings.reminderHours.join(", "),
  });
  async function save() {
    const hours = settings.reminderText
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
    if (
      ok(
        await saveVolunteerModuleSettings({
          v2Enabled: settings.v2Enabled,
          timezone: settings.timezone,
          requireSwapApproval: settings.requireSwapApproval,
          reminderHours: hours,
        }),
        "Configurações salvas",
      )
    )
      router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações Voluntariado 2.0</CardTitle>
        <CardDescription>
          Feature flag permanece desligada até smoke real.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-2xl space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.v2Enabled}
            onChange={(e) =>
              setSettings({ ...settings, v2Enabled: e.target.checked })
            }
          />
          Ativar workspace V2 para igreja
        </label>
        <label className="space-y-1 text-sm">
          Fuso horário
          <Input
            value={settings.timezone}
            onChange={(e) =>
              setSettings({ ...settings, timezone: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.requireSwapApproval}
            onChange={(e) =>
              setSettings({
                ...settings,
                requireSwapApproval: e.target.checked,
              })
            }
          />
          Trocas exigem aprovação do líder
        </label>
        <label className="space-y-1 text-sm">
          Lembretes antes da escala, em horas
          <Input
            value={settings.reminderText}
            onChange={(e) =>
              setSettings({ ...settings, reminderText: e.target.value })
            }
            placeholder="72, 24, 2"
          />
        </label>
        <Button onClick={save}>
          <Settings className="mr-2 h-4 w-4" />
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

export function VolunteerManagerV2({ data }: { data: VolunteerDashboardData }) {
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div
      className="space-y-6"
      data-testid="volunteer-manager"
      data-ready={ready ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Voluntariado 2.0</h1>
          <p className="text-muted-foreground">
            Escalas justas, cuidado de pessoas, comunicação e culto.
          </p>
        </div>
        <Badge variant={data.v2Enabled ? "default" : "secondary"}>
          <ShieldCheck className="mr-1 h-3 w-3" />
          {data.v2Enabled ? "V2 ativo" : "V2 em validação"}
        </Badge>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="volunteers">Voluntários</TabsTrigger>
          <TabsTrigger value="teams">Equipes</TabsTrigger>
          <TabsTrigger value="worship">Cultos e escalas</TabsTrigger>
          <TabsTrigger value="communication">Comunicação</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <ManagerOverview data={data} />
          <div className="mt-4 space-y-3">
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">Relatórios</summary>
              <div className="mt-4">
                <ManagerReports data={data} />
              </div>
            </details>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">Configurações</summary>
              <div className="mt-4">
                <ManagerSettings data={data} />
              </div>
            </details>
          </div>
        </TabsContent>
        <TabsContent value="volunteers">
          <ManagerVolunteers data={data} />
        </TabsContent>
        <TabsContent value="teams">
          <ManagerTeams data={data} />
        </TabsContent>
        <TabsContent value="worship">
          <ManagerWorship data={data} />
        </TabsContent>
        <TabsContent value="communication">
          <ManagerCommunication data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  return Uint8Array.from(window.atob(base64), (character) =>
    character.charCodeAt(0),
  );
}

function PushControls() {
  const [pushReady, setPushReady] = useState(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      Notification.permission === "granted",
  );
  async function enablePush() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return toast.error("Chave Web Push não configurada");
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      return toast.error("Notificações não autorizadas");
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration)
      return toast.error("PWA disponível somente após publicação");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const json = subscription.toJSON();
    const result = await saveVolunteerPushSubscription({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      userAgent: navigator.userAgent,
    });
    if (ok(result, "Push ativado")) setPushReady(true);
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={enablePush}
        disabled={pushReady}
      >
        <Bell className="mr-2 h-4 w-4" />
        {pushReady ? "Push ativo" : "Ativar push"}
      </Button>
      <Link
        className={buttonVariants({ variant: "outline", size: "sm" })}
        href="/api/v1/volunteers/calendar"
      >
        <CalendarDays className="mr-2 h-4 w-4" />
        Adicionar calendário
      </Link>
    </div>
  );
}

function PortalAvailability({ data }: { data: VolunteerPortalData }) {
  const router = useRouter();
  const [desired, setDesired] = useState(
    data.availability.desiredServicesPerMonth,
  );
  const [max, setMax] = useState(data.availability.maxServicesPerMonth);
  const [rest, setRest] = useState(data.availability.minimumRestHours);
  const [days, setDays] = useState(
    new Set(
      data.availability.rules
        .filter((rule) => rule.available)
        .map((rule) => rule.weekday),
    ),
  );
  async function save() {
    const rules = weekdayNames.map((_, weekday) => ({
      weekday,
      available: days.has(weekday),
      startsAt: null,
      endsAt: null,
      validFrom: null,
      validUntil: null,
    }));
    if (
      ok(
        await saveMyVolunteerAvailability({
          desiredServicesPerMonth: desired,
          maxServicesPerMonth: max,
          minimumRestHours: rest,
          rules,
          exceptions: data.availability.exceptions.map((item) => ({
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            available: item.available,
            reason: item.reason,
          })),
          preferences: data.availability.preferences,
        }),
        "Disponibilidade salva",
      )
    )
      router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Minha disponibilidade</CardTitle>
        <CardDescription>
          Dias sem marcação ficam indisponíveis quando você define uma regra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {weekdayNames.map((name, weekday) => (
            <Button
              key={name}
              size="sm"
              variant={days.has(weekday) ? "default" : "outline"}
              onClick={() =>
                setDays((current) => {
                  const next = new Set(current);
                  if (next.has(weekday)) next.delete(weekday);
                  else next.add(weekday);
                  return next;
                })
              }
            >
              {name}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">
            Desejo servir/mês
            <Input
              type="number"
              min="0"
              value={desired}
              onChange={(e) => setDesired(Number(e.target.value))}
            />
          </label>
          <label className="text-xs">
            Limite/mês
            <Input
              type="number"
              min="1"
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          </label>
          <label className="text-xs">
            Descanso mínimo (h)
            <Input
              type="number"
              min="0"
              value={rest}
              onChange={(e) => setRest(Number(e.target.value))}
            />
          </label>
        </div>
        <Button onClick={save}>Salvar disponibilidade</Button>
      </CardContent>
    </Card>
  );
}

function PortalPreferences({
  preferences,
}: {
  preferences: VolunteerNotificationPreferences;
}) {
  const router = useRouter();
  const [state, setState] = useState(preferences);
  async function save() {
    if (
      ok(
        await saveMyVolunteerNotificationPreferences(state),
        "Preferências salvas",
      )
    )
      router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências de avisos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(state).map(([key, value]) => (
          <label
            key={key}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <span>{key.replace("Enabled", "").replace(/([A-Z])/g, " $1")}</span>
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => setState({ ...state, [key]: e.target.checked })}
            />
          </label>
        ))}
        <Button onClick={save}>Salvar preferências</Button>
      </CardContent>
    </Card>
  );
}

function PortalAssignment({ shift }: { shift: VolunteerShift }) {
  const router = useRouter();
  const assignment = shift.assignments[0];
  const [reason, setReason] = useState("");
  const [qr, setQr] = useState("");
  const [feedback, setFeedback] = useState({
    rating: 5,
    loadRating: 3,
    comment: "",
    requestContact: false,
  });
  async function respond(response: "confirmed" | "declined") {
    if (
      ok(
        await respondVolunteerAssignment({
          assignmentId: assignment.id,
          response,
          reason,
        }),
        response === "confirmed" ? "Presença confirmada" : "Recusa registrada",
      )
    )
      router.refresh();
  }
  async function swap() {
    if (
      ok(
        await requestVolunteerSwap({
          assignmentId: assignment.id,
          replacementVolunteerId: null,
          reason: reason || "Imprevisto",
        }),
        "Troca solicitada",
      )
    )
      router.refresh();
  }
  async function checkin() {
    if (
      ok(
        await checkInVolunteerAssignment({
          assignmentId: assignment.id,
          qrToken: qr,
        }),
        "Check-in realizado",
      )
    )
      router.refresh();
  }
  async function checkout() {
    if (
      ok(
        await checkOutVolunteerAssignment(assignment.id),
        "Check-out realizado",
      )
    )
      router.refresh();
  }
  async function sendFeedback() {
    if (
      ok(
        await saveVolunteerFeedback({
          assignmentId: assignment.id,
          ...feedback,
        }),
        "Feedback enviado",
      )
    )
      router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between gap-2">
          <div>
            <CardTitle className="text-base">{shift.eventTitle}</CardTitle>
            <CardDescription>
              {shift.departmentName} · {shift.roleName} · {fmt(shift.startsAt)}
            </CardDescription>
          </div>
          <StatusBadge status={assignment.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {shift.instructions && (
          <p className="rounded-md bg-muted p-2 text-sm">
            {shift.instructions}
          </p>
        )}
        {["proposed", "notified"].includes(assignment.status) && (
          <>
            <Input
              placeholder="Motivo se recusar/trocar"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => respond("confirmed")}>
                <Check className="mr-1 h-4 w-4" />
                Confirmar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => respond("declined")}
              >
                <X className="mr-1 h-4 w-4" />
                Recusar
              </Button>
              <Button size="sm" variant="outline" onClick={swap}>
                <RefreshCw className="mr-1 h-4 w-4" />
                Pedir troca
              </Button>
            </div>
          </>
        )}
        {["confirmed", "notified"].includes(assignment.status) && (
          <div className="space-y-2">
            <Input
              placeholder="Código QR opcional"
              value={qr}
              onChange={(e) => setQr(e.target.value)}
            />
            <VolunteerQrScanner onRead={setQr} />
            <Button size="sm" onClick={checkin}>
              <QrCode className="mr-1 h-4 w-4" />
              Check-in
            </Button>
          </div>
        )}
        {assignment.status === "checked_in" && (
          <Button size="sm" onClick={checkout}>
            Check-out
          </Button>
        )}
        {["checked_in", "checked_out"].includes(assignment.status) && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Como foi servir?</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                Experiência 1–5
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={feedback.rating}
                  onChange={(e) =>
                    setFeedback({ ...feedback, rating: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-xs">
                Carga 1–5
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={feedback.loadRating}
                  onChange={(e) =>
                    setFeedback({
                      ...feedback,
                      loadRating: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <Textarea
              placeholder="Observação"
              value={feedback.comment}
              onChange={(e) =>
                setFeedback({ ...feedback, comment: e.target.value })
              }
            />
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={feedback.requestContact}
                onChange={(e) =>
                  setFeedback({ ...feedback, requestContact: e.target.checked })
                }
              />
              Quero conversar com líder
            </label>
            <Button size="sm" variant="outline" onClick={sendFeedback}>
              Enviar feedback
            </Button>
          </div>
        )}
        <ShiftChat shiftId={shift.id} />
      </CardContent>
    </Card>
  );
}

function PortalWorship({ plans }: { plans: VolunteerEventPlan[] }) {
  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <Card key={plan.eventId}>
          <CardHeader>
            <CardTitle>{plan.eventTitle}</CardTitle>
            <CardDescription>{fmt(plan.startsAt)} · roteiro do culto</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <h3 className="mb-2 font-medium">Roteiro</h3>
              <ol className="space-y-2">
                {plan.timeline.map((item) => (
                  <li key={item.id} className="rounded-md border p-2 text-sm">
                    <strong>
                      {fmt(item.plannedAt)} · {item.title}
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      {item.durationMinutes} min · {item.instructions}
                    </p>
                  </li>
                ))}
              </ol>
              {plan.timeline.length === 0 && (
                <p className="text-sm text-muted-foreground">Roteiro ainda não informado.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function VolunteerPortalV2({ data }: { data: VolunteerPortalData }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Minha escala</h1>
          <p className="text-muted-foreground">
            Olá, {data.volunteer.name}. Tudo para servir bem.
          </p>
        </div>
        <PushControls />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          title="Escalas"
          value={data.volunteer.assignments}
          icon={CalendarDays}
        />
        <Metric
          title="Presenças"
          value={data.volunteer.checkins}
          icon={CheckCircle2}
        />
        <Metric
          title="Equipes"
          value={data.volunteer.departmentNames.length}
          icon={UsersRound}
        />
      </div>
      <Tabs defaultValue="schedule">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="schedule">Escalas</TabsTrigger>
          <TabsTrigger value="availability">Disponibilidade</TabsTrigger>
          <TabsTrigger value="worship">Roteiro do culto</TabsTrigger>
          <TabsTrigger value="updates">Atualizações</TabsTrigger>
          <TabsTrigger value="recognition">Reconhecimento</TabsTrigger>
          <TabsTrigger value="settings">Avisos</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="grid gap-4 lg:grid-cols-2">
          {data.upcomingAssignments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma escala próxima.
            </p>
          )}
          {data.upcomingAssignments.map((shift) => (
            <PortalAssignment key={shift.id} shift={shift} />
          ))}
          {data.swaps
            .filter(
              (swap) =>
                swap.replacementVolunteerId === data.volunteer.id &&
                swap.status === "offered",
            )
            .map((swap) => (
              <Card key={swap.id}>
                <CardHeader>
                  <CardTitle>Convite para troca</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{swap.reason}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (
                          ok(
                            await acceptVolunteerSwap(swap.id, true),
                            "Troca aceita",
                          )
                        )
                          router.refresh();
                      }}
                    >
                      Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (
                          ok(
                            await acceptVolunteerSwap(swap.id, false),
                            "Troca recusada",
                          )
                        )
                          router.refresh();
                      }}
                    >
                      Recusar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </TabsContent>
        <TabsContent value="availability">
          <PortalAvailability data={data} />
        </TabsContent>
        <TabsContent value="worship">
          <PortalWorship plans={data.eventPlans} />
        </TabsContent>
        <TabsContent value="updates" className="space-y-3">
          {data.feedPosts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <strong>{post.title}</strong>
                  {post.unread && <Badge>Nova</Badge>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {post.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="recognition" className="grid gap-3 md:grid-cols-2">
          {data.recognitions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Seus agradecimentos aparecerão aqui.
            </p>
          )}
          {data.recognitions.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <Award className="mb-2 h-6 w-6 text-primary" />
                <strong>{item.title}</strong>
                <p className="text-sm text-muted-foreground">{item.message}</p>
                <p className="mt-2 text-xs">{fmt(item.grantedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="settings">
          <PortalPreferences preferences={data.notificationPreferences} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
