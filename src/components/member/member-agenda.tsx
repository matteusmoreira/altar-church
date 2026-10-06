"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition, useState, useMemo } from "react"
import {
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  format,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  HeartHandshake,
  ListFilter,
  MapPin,
  Search,
  Share2,
  Sparkles,
  Users,
  X,
  Church,
  CalendarPlus,
  Compass,
  Loader2,
  Info,
  Settings2,
} from "lucide-react"
import { toast } from "sonner"

import { cancelMemberEventRsvp, rsvpMemberEvent } from "@/lib/member/portal-actions"
import type { MemberAgendaEvent } from "@/lib/member/types"
import { EmptyState, PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Tipos de visualização
type ViewMode = "month" | "week" | "day" | "list"
type CategoryFilter = "all" | "services" | "ministries" | "confirmed"
type ScopeFilter = "selected_day" | "full_period"

// Funções de formatação e utilidades
function capitalizeFirstLetter(str: string) {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function formatFullDate(date: Date) {
  return capitalizeFirstLetter(format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }))
}

function formatMonthYear(date: Date) {
  return capitalizeFirstLetter(format(date, "MMMM 'de' yyyy", { locale: ptBR }))
}

function formatTimeOnly(dateString: string) {
  const d = new Date(dateString)
  return format(d, "HH:mm", { locale: ptBR })
}

function formatGoogleDate(date: Date) {
  return date.toISOString().replace(/-|:|\.\d\d\d/g, "")
}

function getGoogleCalendarUrl(event: MemberAgendaEvent) {
  const startDate = new Date(event.startsAt)
  const endDate = event.endsAt ? new Date(event.endsAt) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    details: `${event.description || ""}${event.ministryName ? `\nMinistério: ${event.ministryName}` : ""}`,
    location: event.location || "",
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function downloadIcsFile(event: MemberAgendaEvent) {
  const startDate = new Date(event.startsAt)
  const endDate = event.endsAt ? new Date(event.endsAt) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000)
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Altar Church//Agenda do Membro//PT",
    "BEGIN:VEVENT",
    `UID:${event.id}@altarchurch`,
    `DTSTAMP:${formatGoogleDate(new Date())}`,
    `DTSTART:${formatGoogleDate(startDate)}`,
    `DTEND:${formatGoogleDate(endDate)}`,
    `SUMMARY:${event.title.replace(/\n/g, " ")}`,
    `DESCRIPTION:${(event.description || "").replace(/\n/g, "\\n")}`,
    `LOCATION:${(event.location || "").replace(/\n/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${event.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
  toast.success("Arquivo de calendário (.ics) baixado!")
}

function shareEvent(event: MemberAgendaEvent) {
  const eventDate = formatFullDate(new Date(event.startsAt))
  const eventTime = formatTimeOnly(event.startsAt)
  const text = `${event.title}\n📅 ${eventDate} às ${eventTime}${event.location ? `\n📍 ${event.location}` : ""}`

  if (typeof navigator !== "undefined" && navigator.share) {
    navigator
      .share({
        title: event.title,
        text,
        url: window.location.href,
      })
      .catch(() => {})
  } else {
    navigator.clipboard.writeText(text)
    toast.success("Detalhes do evento copiados!")
  }
}

function getEventStyle(event: MemberAgendaEvent) {
  const lowerType = (event.type || "").toLowerCase()
  const hasMinistry = Boolean(event.ministryName)

  if (lowerType.includes("culto") || lowerType.includes("service")) {
    return {
      dotColor: "bg-blue-500",
      badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      label: "Culto",
      icon: Church,
    }
  }

  if (hasMinistry || lowerType.includes("minist")) {
    return {
      dotColor: "bg-purple-500",
      badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      label: event.ministryName || "Ministério",
      icon: HeartHandshake,
    }
  }

  if (lowerType.includes("jovens") || lowerType.includes("especial") || lowerType.includes("confer")) {
    return {
      dotColor: "bg-amber-500",
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      label: event.type || "Especial",
      icon: Sparkles,
    }
  }

  return {
    dotColor: "bg-emerald-500",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    label: event.type || "Evento",
    icon: CalendarDays,
  }
}

const emptySubscribe = () => () => {}
function useIsMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

export function MemberAgenda({ events }: { events: MemberAgendaEvent[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isMounted = useIsMounted()

  // Estados de navegação e filtros
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Sub-filtros de escopo (ver apenas o dia selecionado ou todo o mês/semana)
  const [monthScope, setMonthScope] = useState<ScopeFilter>("selected_day")
  const [weekScope, setWeekScope] = useState<ScopeFilter>("full_period")

  // RSVP Action
  function submitRsvp(eventId: string, cancel = false) {
    const formData = new FormData()
    formData.set("eventId", eventId)
    startTransition(async () => {
      try {
        const result = cancel ? await cancelMemberEventRsvp(formData) : await rsvpMemberEvent(formData)
        if (!result.ok) {
          toast.error(result.error ?? "Não foi possível atualizar sua presença")
          return
        }
        const status = "status" in result ? result.status : null
        toast.success(
          cancel
            ? "Presença cancelada com sucesso"
            : status === "waitlisted"
              ? "Você entrou na lista de espera"
              : "Presença confirmada com sucesso!"
        )
        router.refresh()
      } catch {
        toast.error("Não foi possível atualizar sua presença. Verifique sua conexão e tente novamente.")
      }
    })
  }

  // Filtragem dos eventos pela busca e categoria
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Filtro de busca textual
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = event.title.toLowerCase().includes(query)
        const matchesDesc = (event.description || "").toLowerCase().includes(query)
        const matchesLoc = (event.location || "").toLowerCase().includes(query)
        const matchesMin = (event.ministryName || "").toLowerCase().includes(query)
        if (!matchesTitle && !matchesDesc && !matchesLoc && !matchesMin) {
          return false
        }
      }

      // Filtro por categoria
      if (categoryFilter === "services") {
        const type = (event.type || "").toLowerCase()
        return type.includes("culto") || type.includes("service")
      }
      if (categoryFilter === "ministries") {
        return Boolean(event.ministryName)
      }
      if (categoryFilter === "confirmed") {
        return event.myStatus === "going" || event.myStatus === "waitlisted"
      }

      return true
    })
  }, [events, searchQuery, categoryFilter])

  // Próximo evento futuro disponível (para atalhos nos empty states)
  const nextUpcomingEvent = useMemo(() => {
    const today = startOfDay(new Date())
    return events.find((e) => {
      const eventDate = startOfDay(new Date(e.startsAt))
      return !isBefore(eventDate, today)
    })
  }, [events])

  // Contagem de eventos confirmados do membro
  const myConfirmedCount = useMemo(() => {
    return events.filter((e) => e.myStatus === "going" || e.myStatus === "waitlisted").length
  }, [events])

  // Navegação no tempo baseada no modo de visualização
  function handlePrevious() {
    if (viewMode === "month") {
      setSelectedDate((prev) => subMonths(prev, 1))
    } else if (viewMode === "week") {
      setSelectedDate((prev) => subWeeks(prev, 1))
    } else if (viewMode === "day") {
      setSelectedDate((prev) => subDays(prev, 1))
    }
  }

  function handleNext() {
    if (viewMode === "month") {
      setSelectedDate((prev) => addMonths(prev, 1))
    } else if (viewMode === "week") {
      setSelectedDate((prev) => addWeeks(prev, 1))
    } else if (viewMode === "day") {
      setSelectedDate((prev) => addDays(prev, 1))
    }
  }

  function handleToday() {
    setSelectedDate(new Date())
  }

  // Título dinâmico do período atual
  const periodTitle = useMemo(() => {
    if (viewMode === "month") {
      return formatMonthYear(selectedDate)
    }
    if (viewMode === "week") {
      const start = startOfWeek(selectedDate, { weekStartsOn: 0 })
      const end = endOfWeek(selectedDate, { weekStartsOn: 0 })
      if (isSameMonth(start, end)) {
        return `${format(start, "dd")} a ${format(end, "dd 'de' MMMM, yyyy", { locale: ptBR })}`
      }
      return `${format(start, "dd MMM", { locale: ptBR })} a ${format(end, "dd MMM yyyy", { locale: ptBR })}`
    }
    if (viewMode === "day") {
      return formatFullDate(selectedDate)
    }
    return "Todos os Próximos Eventos"
  }, [viewMode, selectedDate])

  // Eventos do dia selecionado
  const selectedDayEvents = useMemo(() => {
    return filteredEvents.filter((event) => isSameDay(new Date(event.startsAt), selectedDate))
  }, [filteredEvents, selectedDate])

  // Eventos da semana selecionada
  const selectedWeekEvents = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 })
    const end = endOfWeek(selectedDate, { weekStartsOn: 0 })
    return filteredEvents.filter((event) => {
      const date = new Date(event.startsAt)
      return (isAfter(date, start) || isSameDay(date, start)) && (isBefore(date, end) || isSameDay(date, end))
    })
  }, [filteredEvents, selectedDate])

  // Eventos de todo o mês atual
  const selectedMonthEvents = useMemo(() => {
    return filteredEvents.filter((event) => isSameMonth(new Date(event.startsAt), selectedDate))
  }, [filteredEvents, selectedDate])

  // Dias da semana atual (para a barra de 7 dias)
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 })
    const end = endOfWeek(selectedDate, { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [selectedDate])

  // Dias do mês atual em grid 7 colunas (com padding de dias vizinhos)
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(selectedDate)
    const monthEnd = endOfMonth(selectedDate)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [selectedDate])

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página Canônico com Seletor de Visão */}
      <PageHeader
        title="Agenda"
        description="Cultos, eventos e programações especiais da sua igreja."
        badge={
          <Badge variant="secondary" className="font-semibold">
            {events.length} {events.length === 1 ? "evento" : "eventos"}
          </Badge>
        }
        actions={
          <div className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-muted/50 p-1 shadow-xs backdrop-blur-sm sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all touch-manipulation sm:flex-none sm:px-3 sm:text-sm",
                viewMode === "day"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span>Dia</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all touch-manipulation sm:flex-none sm:px-3 sm:text-sm",
                viewMode === "week"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarRange className="h-4 w-4 shrink-0" />
              <span>Semana</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all touch-manipulation sm:flex-none sm:px-3 sm:text-sm",
                viewMode === "month"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>Mês</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all touch-manipulation sm:flex-none sm:px-3 sm:text-sm",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Todos os eventos em lista"
            >
              <ListFilter className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
        }
      />

      {/* Barra de Navegação Temporal (se não estiver no modo Lista) */}
      {viewMode !== "list" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-xs backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between sm:justify-start sm:gap-3">
            <h2 className="truncate text-base font-bold capitalize sm:text-lg">{periodTitle}</h2>
            {isMounted && isToday(selectedDate) && viewMode === "day" && (
              <Badge className="bg-primary/10 text-primary border-primary/20 shrink-0">Hoje</Badge>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToday}
              className={cn(
                "rounded-xl text-xs font-semibold touch-manipulation",
                isMounted && isToday(selectedDate) && "border-primary/40 bg-primary/5 text-primary"
              )}
            >
              Hoje
            </Button>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handlePrevious}
                className="h-8 w-8 rounded-xl"
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleNext}
                className="h-8 w-8 rounded-xl"
                aria-label="Próximo período"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros de Categoria em Chips e Campo de Pesquisa */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all touch-manipulation",
              categoryFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span>Todos</span>
            <span className="opacity-80">({events.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("services")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all touch-manipulation",
              categoryFilter === "services"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Church className="h-3 w-3" />
            <span>Cultos</span>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("ministries")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all touch-manipulation",
              categoryFilter === "ministries"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <HeartHandshake className="h-3 w-3" />
            <span>Ministérios</span>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("confirmed")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all touch-manipulation",
              categoryFilter === "confirmed"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Meus RSVPs</span>
            {myConfirmedCount > 0 && <span className="opacity-80">({myConfirmedCount})</span>}
          </button>
        </div>

        {/* Input de Busca Rápida */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar culto ou evento..."
            className="h-9 rounded-xl pl-9 pr-8 text-xs sm:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. VISÃO MÊS (Month View)                                                 */}
      {/* ========================================================================= */}
      {viewMode === "month" && (
        <div className="space-y-6">
          {/* Card do Grid do Calendário Mensal */}
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-md sm:p-6">
            {/* Cabeçalho dos Dias da Semana */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dayName, idx) => (
                <div
                  key={dayName}
                  className={cn(
                    "py-1.5 text-[11px] font-bold uppercase tracking-wider sm:py-2",
                    idx === 0 ? "text-primary" : "text-muted-foreground/80"
                  )}
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* Grid dos Dias do Mês */}
            <div className="grid grid-cols-7 gap-1 pt-2 sm:gap-2">
              {monthDays.map((day) => {
                const isSelected = isSameDay(day, selectedDate)
                const isCurrentMonth = isSameMonth(day, selectedDate)
                const dayIsToday = isMounted && isToday(day)
                // Eventos presentes neste dia
                const dayEvents = filteredEvents.filter((e) => isSameDay(new Date(e.startsAt), day))
                const hasEvents = dayEvents.length > 0

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day)
                      setMonthScope("selected_day")
                    }}
                    className={cn(
                      "group relative flex min-h-[48px] flex-col items-center justify-between rounded-2xl p-1.5 transition-all touch-manipulation sm:min-h-[64px] sm:p-2",
                      isSelected
                        ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 scale-[1.03]"
                        : dayIsToday
                          ? "border border-primary/50 bg-primary/5 font-bold text-primary hover:bg-primary/10"
                          : isCurrentMonth
                            ? "hover:bg-muted/70 text-foreground"
                            : "text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs sm:text-sm",
                        isSelected && "text-primary-foreground font-bold",
                        !isSelected && dayIsToday && "text-primary font-bold"
                      )}
                    >
                      {format(day, "d")}
                    </span>

                    {/* Indicadores de Eventos (Dots Coloridos) */}
                    <div className="flex h-2 items-center justify-center gap-1">
                      {hasEvents &&
                        dayEvents.slice(0, 3).map((e, idx) => {
                          const style = getEventStyle(e)
                          return (
                            <span
                              key={idx}
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isSelected ? "bg-white" : style.dotColor
                              )}
                              title={e.title}
                            />
                          )
                        })}
                      {dayEvents.length > 3 && (
                        <span
                          className={cn(
                            "h-1 w-1 rounded-full",
                            isSelected ? "bg-white/80" : "bg-muted-foreground/60"
                          )}
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Seletor de Escopo & Lista de Eventos */}
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold sm:text-lg">
                  {monthScope === "selected_day"
                    ? `Eventos em ${formatFullDate(selectedDate)}`
                    : `Todos os Eventos de ${formatMonthYear(selectedDate)}`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {monthScope === "selected_day"
                    ? selectedDayEvents.length === 0
                      ? "Nenhuma atividade agendada para este dia específico"
                      : `${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? "evento programado" : "eventos programados"}`
                    : `${selectedMonthEvents.length} ${selectedMonthEvents.length === 1 ? "evento neste mês" : "eventos neste mês"}`}
                </p>
              </div>

              {/* Toggle Inteligente: Ver dia selecionado vs ver mês completo */}
              <div className="flex items-center gap-1 self-start rounded-xl border border-border/60 bg-muted/40 p-0.5 text-xs font-semibold sm:self-auto">
                <button
                  type="button"
                  onClick={() => setMonthScope("selected_day")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition-all touch-manipulation",
                    monthScope === "selected_day"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Dia selecionado ({selectedDayEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMonthScope("full_period")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition-all touch-manipulation",
                    monthScope === "full_period"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Mês inteiro ({selectedMonthEvents.length})
                </button>
              </div>
            </div>

            {/* Conteúdo: Dia selecionado ou Mês completo */}
            {monthScope === "selected_day" ? (
              selectedDayEvents.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {selectedDayEvents.map((event) => (
                    <MemberAgendaCard
                      key={event.id}
                      event={event}
                      pending={pending}
                      onSubmitRsvp={submitRsvp}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-border/80 bg-card/40 p-6 text-center sm:p-8">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
                    <CalendarDays className="h-6 w-6" />
                  </div>
                  <h4 className="mt-3 text-sm font-semibold sm:text-base">
                    Nenhum evento neste dia
                  </h4>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">
                    Aproveite para conectar-se com sua célula ou conferir os eventos do mês.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {selectedMonthEvents.length > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setMonthScope("full_period")}
                        className="rounded-xl text-xs font-semibold"
                      >
                        Ver todos os {selectedMonthEvents.length} eventos do mês
                      </Button>
                    )}

                    {nextUpcomingEvent && !isSameDay(new Date(nextUpcomingEvent.startsAt), selectedDate) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedDate(new Date(nextUpcomingEvent.startsAt))
                          setMonthScope("selected_day")
                        }}
                        className="rounded-xl border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 text-xs font-semibold"
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Próximo evento ({format(new Date(nextUpcomingEvent.startsAt), "dd/MM")})
                      </Button>
                    )}
                  </div>
                </div>
              )
            ) : selectedMonthEvents.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {selectedMonthEvents.map((event) => (
                  <MemberAgendaCard
                    key={event.id}
                    event={event}
                    pending={pending}
                    onSubmitRsvp={submitRsvp}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/80 bg-card/40 p-6 text-center sm:p-8">
                <p className="text-sm text-muted-foreground">Nenhum evento cadastrado em {periodTitle}.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VISÃO SEMANA (Week View)                                               */}
      {/* ========================================================================= */}
      {viewMode === "week" && (
        <div className="space-y-6">
          {/* Carrossel Horizontal de 7 Dias da Semana */}
          <div className="grid grid-cols-7 gap-1.5 rounded-3xl border border-border/60 bg-card/80 p-2 shadow-sm backdrop-blur-md sm:gap-3 sm:p-4">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, selectedDate)
              const dayIsToday = isMounted && isToday(day)
              const dayEvents = filteredEvents.filter((e) => isSameDay(new Date(e.startsAt), day))
              const hasEvents = dayEvents.length > 0

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setSelectedDate(day)
                    setWeekScope("selected_day")
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-all touch-manipulation sm:py-4",
                    isSelected
                      ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 scale-[1.04]"
                      : dayIsToday
                        ? "border border-primary/50 bg-primary/5 font-semibold text-primary hover:bg-primary/10"
                        : "hover:bg-muted/70 text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase sm:text-xs",
                      isSelected ? "text-primary-foreground/90 font-bold" : "text-muted-foreground"
                    )}
                  >
                    {format(day, "EEE", { locale: ptBR }).replace(".", "")}
                  </span>
                  <span className="text-base font-extrabold sm:text-xl">
                    {format(day, "dd")}
                  </span>

                  {/* Indicador de presença de evento */}
                  <div className="flex h-1.5 items-center justify-center gap-1">
                    {hasEvents ? (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isSelected ? "bg-white" : "bg-primary"
                        )}
                      />
                    ) : (
                      <span className="h-1.5 w-1.5 opacity-0" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Lista dos Eventos da Semana com Toggle de Escopo */}
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold sm:text-lg">
                  {weekScope === "selected_day"
                    ? `Eventos em ${formatFullDate(selectedDate)}`
                    : "Programação da Semana"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {weekScope === "selected_day"
                    ? `${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? "evento neste dia" : "eventos neste dia"}`
                    : `${selectedWeekEvents.length} ${selectedWeekEvents.length === 1 ? "evento nesta semana" : "eventos nesta semana"}`}
                </p>
              </div>

              {/* Alternar entre dia clicado e semana inteira */}
              <div className="flex items-center gap-1 self-start rounded-xl border border-border/60 bg-muted/40 p-0.5 text-xs font-semibold sm:self-auto">
                <button
                  type="button"
                  onClick={() => setWeekScope("selected_day")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition-all touch-manipulation",
                    weekScope === "selected_day"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Dia selecionado ({selectedDayEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWeekScope("full_period")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition-all touch-manipulation",
                    weekScope === "full_period"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Semana inteira ({selectedWeekEvents.length})
                </button>
              </div>
            </div>

            {/* Conteúdo: Dia selecionado ou Semana inteira */}
            {weekScope === "selected_day" ? (
              selectedDayEvents.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {selectedDayEvents.map((event) => (
                    <MemberAgendaCard
                      key={event.id}
                      event={event}
                      pending={pending}
                      onSubmitRsvp={submitRsvp}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-border/80 bg-card/40 p-6 text-center sm:p-8">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
                    <CalendarDays className="h-6 w-6" />
                  </div>
                  <h4 className="mt-3 text-sm font-semibold sm:text-base">
                    Nenhum evento neste dia
                  </h4>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">
                    Não há programações agendadas para {formatFullDate(selectedDate)}.
                  </p>

                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setWeekScope("full_period")}
                      className="rounded-xl text-xs font-semibold"
                    >
                      Ver eventos da semana inteira ({selectedWeekEvents.length})
                    </Button>
                  </div>
                </div>
              )
            ) : selectedWeekEvents.length > 0 ? (
              <div className="space-y-6">
                {weekDays
                  .filter((day) => selectedWeekEvents.some((e) => isSameDay(new Date(e.startsAt), day)))
                  .map((day) => {
                    const dayEvents = selectedWeekEvents.filter((e) =>
                      isSameDay(new Date(e.startsAt), day)
                    )
                    const isSelectedDay = isSameDay(day, selectedDate)

                    return (
                      <div key={day.toISOString()} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-xl text-xs font-bold",
                              isSelectedDay
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-muted text-foreground"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          <span className="text-sm font-bold capitalize">
                            {formatFullDate(day)}
                          </span>
                          {isMounted && isToday(day) && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                              Hoje
                            </Badge>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          {dayEvents.map((event) => (
                            <MemberAgendaCard
                              key={event.id}
                              event={event}
                              pending={pending}
                              onSubmitRsvp={submitRsvp}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/80 bg-card/40 p-6 text-center sm:p-8">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
                  <CalendarRange className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-sm font-semibold sm:text-base">
                  Nenhum evento nesta semana
                </h4>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">
                  Não há programações agendadas para o intervalo de {periodTitle}.
                </p>

                {nextUpcomingEvent && (
                  <div className="mt-5 inline-block">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDate(new Date(nextUpcomingEvent.startsAt))
                        setWeekScope("selected_day")
                      }}
                      className="rounded-2xl border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Ir para próximo evento ({format(new Date(nextUpcomingEvent.startsAt), "dd/MM")})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. VISÃO DIA (Day View / Timeline)                                        */}
      {/* ========================================================================= */}
      {viewMode === "day" && (
        <div className="space-y-6">
          {/* Seletor rápido de Dia Anterior / Hoje / Próximo Dia */}
          <div className="flex items-center justify-between rounded-3xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-md">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate((prev) => subDays(prev, 1))}
              className="gap-1 rounded-xl text-xs font-semibold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dia anterior</span>
            </Button>

            <div className="text-center">
              <p className="text-xs font-bold text-primary">
                {isMounted && isToday(selectedDate) ? "Hoje" : format(selectedDate, "EEEE", { locale: ptBR })}
              </p>
              <p className="text-sm font-extrabold sm:text-base">
                {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate((prev) => addDays(prev, 1))}
              className="gap-1 rounded-xl text-xs font-semibold"
            >
              <span className="hidden sm:inline">Próximo dia</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Timeline de Horários do Dia com Alinhamento Robusto */}
          {selectedDayEvents.length > 0 ? (
            <div className="space-y-4">
              {selectedDayEvents.map((event, index) => {
                const eventStyle = getEventStyle(event)
                const startTime = formatTimeOnly(event.startsAt)
                const endTime = event.endsAt ? formatTimeOnly(event.endsAt) : null
                const isLast = index === selectedDayEvents.length - 1

                return (
                  <div key={event.id} className="flex items-stretch gap-3 sm:gap-5">
                    {/* Coluna da Linha do Tempo */}
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background shadow-xs">
                        <span className={cn("h-2.5 w-2.5 rounded-full", eventStyle.dotColor)} />
                      </div>
                      {!isLast && <div className="w-0.5 flex-1 bg-primary/20 my-1" />}
                    </div>

                    {/* Conteúdo do Horário e Card */}
                    <div className="min-w-0 flex-1 pb-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs font-bold text-primary sm:text-sm">
                          <Clock className="h-3.5 w-3.5" />
                          {startTime} {endTime ? `às ${endTime}` : ""}
                        </span>
                        <Badge className={cn("text-[10px]", eventStyle.badgeClass)}>
                          {eventStyle.label}
                        </Badge>
                      </div>

                      <MemberAgendaCard
                        event={event}
                        pending={pending}
                        onSubmitRsvp={submitRsvp}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border/80 bg-card/40 p-6 text-center sm:p-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
                <Clock className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-semibold sm:text-base">
                Nenhum evento neste dia
              </h4>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">
                Não há horários agendados para {formatFullDate(selectedDate)}.
              </p>

              {nextUpcomingEvent && (
                <div className="mt-5 inline-block">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDate(new Date(nextUpcomingEvent.startsAt))}
                    className="rounded-2xl border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Ir para próximo evento ({format(new Date(nextUpcomingEvent.startsAt), "dd/MM")})
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VISÃO LISTA (Lista Completa dos Eventos)                                */}
      {/* ========================================================================= */}
      {viewMode === "list" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold sm:text-lg">Todos os Eventos Programados</h3>
            <Badge variant="outline" className="font-semibold">
              {filteredEvents.length} {filteredEvents.length === 1 ? "evento" : "eventos"}
            </Badge>
          </div>

          {filteredEvents.length === 0 ? (
            <EmptyState
              variant="card"
              icon={CalendarDays}
              title="Nenhum evento encontrado com os filtros aplicados."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredEvents.map((event) => (
                <MemberAgendaCard
                  key={event.id}
                  event={event}
                  pending={pending}
                  onSubmitRsvp={submitRsvp}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTE: MemberAgendaCard (Card Moderno e Completo de Evento)
// =============================================================================
interface MemberAgendaCardProps {
  event: MemberAgendaEvent
  pending: boolean
  onSubmitRsvp: (eventId: string, cancel?: boolean) => void
}

function MemberAgendaCard({ event, pending, onSubmitRsvp }: MemberAgendaCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const eventStyle = getEventStyle(event)
  const isGoing = event.myStatus === "going"
  const isWaitlisted = event.myStatus === "waitlisted"
  const startDate = new Date(event.startsAt)
  const formattedDate = formatFullDate(startDate)
  const startTime = formatTimeOnly(event.startsAt)
  const endTime = event.endsAt ? formatTimeOnly(event.endsAt) : null

  // Cálculo da barra de ocupação
  const occupancyPercent =
    event.maxCapacity && event.maxCapacity > 0
      ? Math.min(100, Math.round((event.goingCount / event.maxCapacity) * 100))
      : null

  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null

  return (
    <Card className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/70 bg-card/90 shadow-xs transition-all duration-200 hover:border-primary/40 hover:shadow-md backdrop-blur-sm">
      <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
        {/* Linha superior: Categoria e Status do Usuário */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Badge className={cn("text-xs font-semibold", eventStyle.badgeClass)}>
            <eventStyle.icon className="mr-1 h-3 w-3" />
            {eventStyle.label}
          </Badge>

          {/* Status do Membro em Destaque */}
          {isGoing && (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
              <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              Presença confirmada
            </Badge>
          )}
          {isWaitlisted && (
            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold">
              Lista de espera
            </Badge>
          )}
        </div>

        {/* Título do Evento */}
        <div className="mt-2 min-w-0">
          <CardTitle className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            {event.title}
          </CardTitle>
          {event.ministryName && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary">
              <HeartHandshake className="h-3 w-3 shrink-0" />
              <span>Ministério: {event.ministryName}</span>
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3.5 p-4 pt-1 sm:p-5 sm:pt-1">
        {/* Descrição */}
        {event.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
            {event.description}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground/60">Sem descrição detalhada</p>
        )}

        {/* Bloco de Horário e Local */}
        <div className="space-y-1.5 rounded-2xl bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary sm:text-sm">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {formattedDate} às {startTime} {endTime ? `– ${endTime}` : ""}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 truncate">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{event.location}</span>
              </div>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  <Compass className="h-3 w-3" />
                  <span>Ver mapa</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Barra de Ocupação & Presença da Comunidade */}
        <div className="space-y-2 rounded-2xl border border-border/50 bg-background/60 p-3">
          <div className="flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-1 text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>
                {event.goingCount}
                {event.maxCapacity !== null ? `/${event.maxCapacity}` : ""} confirmados
              </span>
              {event.waitlistedCount > 0 && (
                <span className="text-muted-foreground">· {event.waitlistedCount} na espera</span>
              )}
            </div>
            {occupancyPercent !== null && (
              <span
                className={cn(
                  "text-[11px] font-bold",
                  occupancyPercent >= 95
                    ? "text-destructive"
                    : occupancyPercent >= 75
                      ? "text-amber-500"
                      : "text-emerald-500"
                )}
              >
                {occupancyPercent}% vagas
              </span>
            )}
          </div>

          {/* Barra de progresso visual quando houver capacidade máxima */}
          {occupancyPercent !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  occupancyPercent >= 95
                    ? "bg-destructive"
                    : occupancyPercent >= 75
                      ? "bg-amber-500"
                      : "bg-primary"
                )}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
          )}

          {/* Nomes de pessoas confirmadas */}
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {event.confirmedPeople.length > 0
              ? `Confirmados: ${event.confirmedPeople.join(", ")}`
              : "Seja o primeiro a confirmar presença!"}
          </p>
        </div>

        {/* Linha de Ações: RSVP, Adicionar ao Calendário, Compartilhar, Link Externo */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Botão de RSVP Principal */}
          <div className="flex flex-wrap items-center gap-2">
            {event.canRsvp && (
              <>
                {isGoing || isWaitlisted ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => onSubmitRsvp(event.id, true)}
                    className="rounded-xl text-xs font-semibold hover:border-destructive/40 hover:text-destructive touch-manipulation"
                  >
                    {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
                    Cancelar presença
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => onSubmitRsvp(event.id)}
                    className="rounded-xl text-xs font-semibold shadow-xs touch-manipulation"
                  >
                    {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                    Aceitar e confirmar presença
                  </Button>
                )}
              </>
            )}

            {/* Link Externo se houver */}
            {event.externalLink && (
              <Button
                render={<a href={event.externalLink} target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs"
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Transmissão / Link
              </Button>
            )}
          </div>

          {/* Ações Secundárias: Adicionar à Agenda e Compartilhar */}
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setDetailsOpen(true)} aria-label={`Ver detalhes de ${event.title}`}>
              <Info className="mr-1 h-4 w-4" />Detalhes
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground touch-manipulation"
                title="Salvar no seu calendário"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Agenda</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1 shadow-lg">
                <DropdownMenuItem
                  onClick={() => window.open(getGoogleCalendarUrl(event), "_blank")}
                  className="rounded-xl text-xs font-medium"
                >
                  <CalendarDays className="mr-2 h-4 w-4 text-blue-500" />
                  Google Agenda
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => downloadIcsFile(event)}
                  className="rounded-xl text-xs font-medium"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                  Apple / Outlook (.ics)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => shareEvent(event)}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
              title="Compartilhar evento"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="pr-7">
            <DialogTitle>{event.title}</DialogTitle>
            <DialogDescription>{event.ministryName || eventStyle.label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 break-words">
            <p className="whitespace-pre-wrap text-sm">{event.description || "Nenhuma descrição informada."}</p>
            <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
              <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />{formattedDate} às {startTime}{endTime ? ` – ${endTime}` : ""}</p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{event.location || "Local não informado"}</p>
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-primary underline">Ver mapa</a>}
              {event.externalLink && <a href={event.externalLink} target="_blank" rel="noopener noreferrer" className="block text-primary underline">Transmissão / Link</a>}
            </div>
            <section className="space-y-2">
              <h3 className="font-semibold">Escala e funções</h3>
              {event.scale.length ? event.scale.map((item) => (
                <div key={item.id} className={cn("space-y-1 rounded-xl border p-3 text-sm", item.isMine && "border-primary bg-primary/5")}>
                  <p className="font-semibold">{item.role}{item.isMine ? " · Sua função" : ""}</p>
                  <p>{item.personName || "Vaga ainda sem pessoa definida"}</p>
                  {item.status && <p className="text-xs text-muted-foreground">{({ proposed: "Escalado", notified: "Aguardando resposta", confirmed: "Confirmado na escala", checked_in: "Check-in realizado", checked_out: "Serviço concluído", no_show: "Ausência registrada" } as Record<string, string>)[item.status] || "Escalado"}</p>}
                  <p className="text-xs text-muted-foreground">{formatTimeOnly(item.startsAt)}{item.endsAt ? ` – ${formatTimeOnly(item.endsAt)}` : ""}</p>
                  {item.instructions && <p className="whitespace-pre-wrap">{item.instructions}</p>}
                </div>
              )) : <p className="text-sm text-muted-foreground">Nenhuma escala publicada para esta atividade.</p>}
            </section>
            <section className="space-y-2 text-sm">
              <h3 className="font-semibold">Presença na atividade</h3>
              <p>{event.goingCount} confirmados{event.maxCapacity ? ` · Limite de ${event.maxCapacity} pessoas` : " · Sem limite de vagas"}{event.waitlistedCount > 0 ? ` · ${event.waitlistedCount} na espera` : ""}</p>
              <p className="text-muted-foreground">{event.confirmedPeople.length ? event.confirmedPeople.join(", ") : "Ninguém confirmou presença ainda."}</p>
              <p className="font-medium">{isGoing ? "Sua presença está confirmada." : isWaitlisted ? "Você está na lista de espera." : "Sua presença ainda não está confirmada."}</p>
              {event.canRsvp && <Button type="button" className="w-full sm:w-auto" disabled={pending} variant={isGoing || isWaitlisted ? "outline" : "default"} onClick={() => onSubmitRsvp(event.id, isGoing || isWaitlisted)}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isGoing || isWaitlisted ? "Cancelar presença" : "Confirmar presença"}
              </Button>}
            </section>
            {event.canManageMinistry && event.ministryId && <Button variant="outline" className="w-full" render={<Link href={`/membro/ministerios/${event.ministryId}`} />} nativeButton={false}>
              <Settings2 className="h-4 w-4" />Configurar ministério e agenda
            </Button>}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
