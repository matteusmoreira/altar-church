"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, ClipboardCheck, Plus, Search, UserMinus, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { removeGroupMember, saveGroupMeeting, saveGroupMember } from "./actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type {
  GroupFormOptions,
  GroupListItem,
  GroupMember,
  GroupMemberRole,
  GroupMeeting,
  SaveGroupMeetingInput,
  SaveGroupMemberInput,
} from "@/lib/groups/types"

export interface GroupOperationsPanelProps {
  formOptions: GroupFormOptions
  groups: GroupListItem[]
  members: GroupMember[]
  meetings: GroupMeeting[]
  selectedGroupId?: string
  onSelectedGroupChange?: (groupId: string) => void
  viewMode?: "all" | "members" | "meetings"
}

type MemberFormState = {
  personId: string
  role: GroupMemberRole
}

type MeetingFormState = {
  title: string
  studyId: string
  startsAt: string
  location: string
  notes: string
  presentCount: number
  visitorCount: number
}

const roleLabels: Record<GroupMemberRole, string> = {
  leader: "Líder",
  co_leader: "Vice-líder",
  host: "Anfitrião",
  member: "Membro",
  visitor: "Visitante",
}

const statusLabels: Record<GroupMember["status"], string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
}

const reportStatusLabels: Record<GroupMeeting["reportStatus"], string> = {
  scheduled: "Agendada",
  reported: "Reportada",
  cancelled: "Cancelada",
}

function todayInputValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

function toDate(value: string) {
  return format(parseISO(value), "dd/MM/yyyy HH:mm", { locale: ptBR })
}

function emptyMeetingForm(): MeetingFormState {
  return {
    title: "Relatório de reunião",
    studyId: "none",
    startsAt: todayInputValue(),
    location: "",
    notes: "",
    presentCount: 0,
    visitorCount: 0,
  }
}

export function GroupOperationsPanel({
  formOptions,
  groups,
  members,
  meetings,
  selectedGroupId: controlledGroupId,
  onSelectedGroupChange,
  viewMode = "all",
}: GroupOperationsPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [internalGroupId, setInternalGroupId] = useState(groups[0]?.id ?? "")
  const activeGroupId = controlledGroupId ?? internalGroupId
  const handleGroupChange = (value: string | null) => {
    if (!value) return
    if (onSelectedGroupChange) onSelectedGroupChange(value)
    setInternalGroupId(value)
  }
  const [searchMember, setSearchMember] = useState("")
  const [memberForm, setMemberForm] = useState<MemberFormState>({ personId: "none", role: "member" })
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(() => emptyMeetingForm())

  const selectedGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0] ?? null

  const selectedMembers = useMemo(() => {
    if (!selectedGroup) return []
    return members.filter((member) => member.groupId === selectedGroup.id)
  }, [members, selectedGroup])

  const filteredMembers = useMemo(() => {
    if (!searchMember.trim()) return selectedMembers
    const q = searchMember.toLowerCase()
    return selectedMembers.filter(
      (member) =>
        member.personName.toLowerCase().includes(q) ||
        (roleLabels[member.role] && roleLabels[member.role].toLowerCase().includes(q))
    )
  }, [selectedMembers, searchMember])

  const selectedMeetings = useMemo(() => {
    if (!selectedGroup) return []
    return meetings.filter((meeting) => meeting.groupId === selectedGroup.id)
  }, [meetings, selectedGroup])

  const availablePeople = useMemo(() => {
    const activePersonIds = new Set(
      selectedMembers
        .filter((member) => member.status === "active")
        .map((member) => member.personId)
    )
    return formOptions.people.filter((person) => !activePersonIds.has(person.id))
  }, [formOptions.people, selectedMembers])

  function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedGroup || memberForm.personId === "none") {
      toast.error("Selecione célula e pessoa")
      return
    }

    const input: SaveGroupMemberInput = {
      groupId: selectedGroup.id,
      personId: memberForm.personId,
      role: memberForm.role,
      status: "active",
    }

    startTransition(async () => {
      const result = await saveGroupMember(input)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar participante")
        return
      }
      toast.success("Participante salvo")
      setMemberForm({ personId: "none", role: "member" })
      router.refresh()
    })
  }

  function removeMember(member: GroupMember) {
    startTransition(async () => {
      const result = await removeGroupMember({ id: member.id })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível remover participante")
        return
      }
      toast.success("Participante removido")
      router.refresh()
    })
  }

  function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedGroup) {
      toast.error("Selecione uma célula")
      return
    }
    const input: SaveGroupMeetingInput = {
      groupId: selectedGroup.id,
      studyId: meetingForm.studyId === "none" ? null : meetingForm.studyId,
      title: meetingForm.title,
      startsAt: meetingForm.startsAt,
      location: meetingForm.location,
      notes: meetingForm.notes,
      reportStatus: "reported",
      presentCount: meetingForm.presentCount,
      visitorCount: meetingForm.visitorCount,
    }

    startTransition(async () => {
      const result = await saveGroupMeeting(input)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar reunião")
        return
      }
      toast.success("Reunião reportada")
      setMeetingForm(emptyMeetingForm())
      router.refresh()
    })
  }

  if (groups.length === 0) {
    return null
  }

  const cellSelector = (
    <div className="grid gap-2 md:max-w-md">
      <Label>Célula operacional</Label>
      <Select value={selectedGroup?.id ?? ""} onValueChange={handleGroupChange}>
        <SelectTrigger data-testid="group-ops-group-select" className="w-full">
          <SelectValue>{selectedGroup?.name ?? "Selecione célula"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const membersContent = (
    <div className="space-y-4">
      <form onSubmit={submitMember} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <Select value={memberForm.personId} onValueChange={(value) => setMemberForm({ ...memberForm, personId: value ?? "none" })}>
          <SelectTrigger data-testid="group-member-person-select" className="w-full">
            <SelectValue>
              {memberForm.personId === "none"
                ? "Selecionar pessoa"
                : formOptions.people.find((person) => person.id === memberForm.personId)?.fullName ?? "Selecionar pessoa"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecionar pessoa</SelectItem>
            {availablePeople.map((person) => (
              <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={memberForm.role} onValueChange={(value) => setMemberForm({ ...memberForm, role: (value ?? "member") as GroupMemberRole })}>
          <SelectTrigger data-testid="group-member-role-select" className="w-full">
            <SelectValue>{roleLabels[memberForm.role]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(roleLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button data-testid="group-member-save-button" type="submit" disabled={isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar
        </Button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar participante por nome ou função..."
            value={searchMember}
            onChange={(e) => setSearchMember(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredMembers.length} {filteredMembers.length === 1 ? "participante" : "participantes"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {searchMember ? "Nenhum participante encontrado com esse termo." : "Nenhum participante cadastrado nesta célula."}
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.personName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">{roleLabels[member.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.status === "active" ? "default" : "secondary"}>{statusLabels[member.status]}</Badge>
                  </TableCell>
                  <TableCell>{member.joinedAt ? format(parseISO(member.joinedAt), "dd/MM/yyyy", { locale: ptBR }) : "-"}</TableCell>
                  <TableCell>
                    <Button
                      aria-label={`Remover ${member.personName}`}
                      variant="ghost"
                      size="icon"
                      disabled={isPending || member.status !== "active"}
                      onClick={() => removeMember(member)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  const meetingsContent = (
    <div className="space-y-4">
      <form onSubmit={submitMeeting} className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Título</Label>
          <Input
            data-testid="group-meeting-title-input"
            value={meetingForm.title}
            onChange={(event) => setMeetingForm({ ...meetingForm, title: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Início</Label>
          <Input
            data-testid="group-meeting-start-input"
            type="datetime-local"
            value={meetingForm.startsAt}
            onChange={(event) => setMeetingForm({ ...meetingForm, startsAt: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Estudo</Label>
          <Select value={meetingForm.studyId} onValueChange={(value) => setMeetingForm({ ...meetingForm, studyId: value ?? "none" })}>
            <SelectTrigger data-testid="group-meeting-study-select" className="w-full">
              <SelectValue>
                {meetingForm.studyId === "none"
                  ? "Sem estudo"
                  : formOptions.studies.find((study) => study.id === meetingForm.studyId)?.title ?? "Sem estudo"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem estudo (opcional)</SelectItem>
              {formOptions.studies.map((study) => (
                <SelectItem key={study.id} value={study.id}>{study.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Local</Label>
          <Input
            data-testid="group-meeting-location-input"
            value={meetingForm.location}
            onChange={(event) => setMeetingForm({ ...meetingForm, location: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Presentes</Label>
          <Input
            data-testid="group-meeting-present-input"
            type="number"
            min={0}
            value={meetingForm.presentCount}
            onChange={(event) => setMeetingForm({ ...meetingForm, presentCount: Number(event.target.value) })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Visitantes</Label>
          <Input
            data-testid="group-meeting-visitor-input"
            type="number"
            min={0}
            value={meetingForm.visitorCount}
            onChange={(event) => setMeetingForm({ ...meetingForm, visitorCount: Number(event.target.value) })}
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label>Observações</Label>
          <Textarea
            data-testid="group-meeting-notes-input"
            value={meetingForm.notes}
            onChange={(event) => setMeetingForm({ ...meetingForm, notes: event.target.value })}
            rows={3}
          />
        </div>
        <div className="md:col-span-2">
          <Button data-testid="group-meeting-save-button" type="submit" disabled={isPending} className="gradient-primary">
            <CalendarDays className="mr-2 h-4 w-4" />
            Salvar relatório
          </Button>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {selectedMeetings.map((meeting) => (
          <div key={meeting.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{meeting.title}</p>
                <p className="text-sm text-muted-foreground">{toDate(meeting.startsAt)}</p>
              </div>
              <Badge variant={meeting.reportStatus === "reported" ? "default" : "secondary"}>
                {reportStatusLabels[meeting.reportStatus]}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {meeting.presentCount} presentes · {meeting.visitorCount} visitantes
            </p>
            {meeting.studyTitle && <p className="mt-1 text-sm">Estudo: {meeting.studyTitle}</p>}
            {meeting.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{meeting.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  )

  if (viewMode === "members") {
    const activeMemberCount = selectedMembers.filter((m) => m.status === "active").length
    const maxCap = selectedGroup?.maxCapacity || 0
    const openVacancies = maxCap > 0 ? Math.max(0, maxCap - activeMemberCount) : null

    return (
      <Card>
        <CardHeader>
          <CardTitle>Participantes da Célula</CardTitle>
          <CardDescription>Gestão de participantes e liderança da célula selecionada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
            {cellSelector}
            {selectedGroup && (
              <div className="flex flex-wrap gap-2 text-sm">
                <div className="rounded-lg border bg-muted/40 px-3 py-1.5">
                  <span className="text-muted-foreground">Líder: </span>
                  <strong className="font-semibold">{selectedGroup.leaderName ?? "Sem líder"}</strong>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-1.5">
                  <span className="text-muted-foreground">Membros: </span>
                  <strong className="font-semibold">{activeMemberCount}</strong>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-1.5">
                  <span className="text-muted-foreground">Vagas: </span>
                  <strong className="font-semibold">{openVacancies !== null ? openVacancies : "Livre"}</strong>
                </div>
              </div>
            )}
          </div>
          {membersContent}
        </CardContent>
      </Card>
    )
  }

  if (viewMode === "meetings") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Relatórios e Reuniões da Célula</CardTitle>
          <CardDescription>Lançamento de relatórios e encontros da célula selecionada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {cellSelector}
          {meetingsContent}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Participantes e reuniões</CardTitle>
        <CardDescription>Participantes e encontros reais das células.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cellSelector}

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">
              <UsersRound className="h-4 w-4" />
              Participantes
            </TabsTrigger>
            <TabsTrigger value="meetings">
              <ClipboardCheck className="h-4 w-4" />
              Reuniões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            {membersContent}
          </TabsContent>

          <TabsContent value="meetings">
            {meetingsContent}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
