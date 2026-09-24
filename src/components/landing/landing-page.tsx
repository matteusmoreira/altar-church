import Image from "next/image"
import Link from "next/link"
import { Inter } from "next/font/google"
import {
  ArrowRight,
  Baby,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Contact,
  Flame,
  HandHeart,
  Handshake,
  HeartHandshake,
  Home,
  LineChart,
  Mail,
  Megaphone,
  MessageCircle,
  Music,
  Network,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sprout,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Webhook,
} from "lucide-react"

import { CountUp } from "@/components/landing/count-up"
import { LandingHeader } from "@/components/landing/landing-header"
import { Reveal } from "@/components/landing/reveal"
import { ScrollProgress } from "@/components/landing/scroll-progress"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"] })

const MODULES = [
  { icon: Users, label: "Pessoas & Membros" },
  { icon: UsersRound, label: "Células & GCeus" },
  { icon: CalendarDays, label: "Eventos" },
  { icon: QrCode, label: "Presença QR" },
  { icon: Wallet, label: "Financeiro" },
  { icon: HandHeart, label: "Doações" },
  { icon: ClipboardCheck, label: "Voluntariado" },
  { icon: Baby, label: "Kids" },
  { icon: Music, label: "Louvor" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: BookOpen, label: "Discipulado" },
  { icon: BarChart3, label: "Relatórios" },
  { icon: Building2, label: "Congregações" },
  { icon: ShieldCheck, label: "Segurança" },
]

const PILLARS = [
  {
    icon: Network,
    title: "Conectar",
    description:
      "Pessoas, células, ministérios e eventos conversando entre si. Cada área no seu lugar — e tudo em um só lugar.",
  },
  {
    icon: HeartHandshake,
    title: "Cuidar",
    description:
      "Do check-in ao follow-up pastoral, a rotina organizada libera tempo para quem precisa de atenção.",
  },
  {
    icon: Sprout,
    title: "Multiplicar",
    description:
      "Células com saúde e visibilidade, visitantes acompanhados e uma igreja que cresce com ordem.",
  },
]

const TIMELINE_360 = [
  { label: "Visita registrada", when: "Domingo, 9h", color: "#00C9E8" },
  { label: "Entrou na célula Vida", when: "Há 2 semanas", color: "#2563EB" },
  { label: "Follow-up em andamento", when: "Ana · hoje", color: "#6C43FF" },
]

const CHANNELS = [
  { icon: MessageCircle, name: "WhatsApp", meta: "248 enviados" },
  { icon: Mail, name: "E-mail", meta: "126 entregues" },
  { icon: Smartphone, name: "Push", meta: "Ativo" },
]

const FEATURES = [
  {
    icon: UsersRound,
    title: "Células & GCeus",
    description:
      "Relatórios semanais, presença, saúde das células e supervisão em tempo real.",
  },
  {
    icon: CalendarDays,
    title: "Eventos & Programação",
    description:
      "Do rascunho ao check-in: inscrições, capacidade, escalas e relatório pós-evento.",
  },
  {
    icon: Wallet,
    title: "Financeiro & Doações",
    description:
      "Receitas, despesas, centros de custo e exportações auditadas com transparência.",
  },
  {
    icon: ClipboardCheck,
    title: "Voluntariado & Escalas",
    description:
      "Escalas por disponibilidade, trocas, confirmações e check-in do voluntário.",
  },
  {
    icon: QrCode,
    title: "Presença com QR Code",
    description:
      "Chamada em segundos pelo celular e frequência que revela o pulso da igreja.",
  },
  {
    icon: Music,
    title: "Louvor & Setlists",
    description:
      "Repertório, setlists e escalas do ministério de louvor em um só lugar.",
  },
  {
    icon: LineChart,
    title: "Relatórios & CRM",
    description:
      "Indicadores reais por módulo e funil de relacionamento com colunas próprias.",
  },
]

const EXTRA_FEATURES = [
  { icon: Flame, label: "Intercessão & oração" },
  { icon: BookOpen, label: "Discipulado & trilhas" },
  { icon: Building2, label: "Multi-congregações" },
  { icon: ClipboardList, label: "Formulários inteligentes" },
  { icon: Webhook, label: "API & webhooks" },
  { icon: Smartphone, label: "App PWA instalável" },
]

const KIDS_BULLETS = [
  "Check-in com QR Code e etiqueta impressa na hora",
  "Portal da Família: pais acompanham tudo pelo celular",
  "Chamada em sala e painel de recepção em tempo real",
  "Comunicação direta com os pais durante o culto",
]

const PORTALS = [
  {
    icon: UserRound,
    title: "Portal do Membro",
    description: "Cada pessoa acompanha a própria caminhada com a igreja.",
    items: ["Agenda de cultos e células", "RSVP de eventos", "Pedidos de oração"],
  },
  {
    icon: Handshake,
    title: "Portal do Voluntário",
    description: "Serving sem planilha: o voluntário resolve tudo pelo celular.",
    items: ["Minhas escalas e disponibilidade", "Trocas com a equipe", "Comunicados do ministério"],
  },
  {
    icon: Home,
    title: "Portal da Família",
    description: "As famílias vivem o culto com paz, do check-in à retirada.",
    items: ["Check-in e etiqueta dos filhos", "Chamada em sala em tempo real", "Avisos da recepção"],
  },
]

const STEPS = [
  {
    number: "01",
    title: "Cadastre sua igreja",
    description: "Crie sua conta em minutos e configure congregações, ministérios e usuários da sua equipe.",
  },
  {
    number: "02",
    title: "Convide sua equipe",
    description: "Cada líder acessa o que precisa: secretaria, finanças, kids, louvor, voluntários e pastores.",
  },
  {
    number: "03",
    title: "Gerencie tudo em um lugar",
    description: "Acompanhe membros, células, eventos e finanças com relatórios vivos, de qualquer dispositivo.",
  },
]

const HERO_BARS = [
  { value: 42, day: "D" },
  { value: 58, day: "S" },
  { value: 50, day: "T" },
  { value: 72, day: "Q" },
  { value: 64, day: "Q" },
  { value: 88, day: "S" },
  { value: 96, day: "D" },
]

const KIDS_ROOMS = [
  { name: "Sala Maternal", count: "12 crianças", pct: "w-3/4" },
  { name: "Sala Jardim", count: "24 crianças", pct: "w-full" },
  { name: "Sala Juniores", count: "18 crianças", pct: "w-5/6" },
]

function SectionIntro({
  kicker,
  title,
  gradient,
  description,
}: {
  kicker: string
  title: string
  gradient: string
  description?: string
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-bold tracking-[0.25em] text-(--ac-cyan) uppercase">{kicker}</span>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
        {title} <span className="text-ac-gradient">{gradient}</span>
      </h2>
      {description ? (
        <p className="mt-5 text-base leading-relaxed text-(--ac-muted) sm:text-lg">{description}</p>
      ) : null}
    </Reveal>
  )
}

/** Painel "janela de app" do hero: presença ao vivo, barras e KPIs. */
function HeroDashboard() {
  return (
    <div className="relative rounded-3xl border border-white/10 bg-(--ac-surface)/70 p-6 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.9)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-white/40 uppercase">Visão geral</p>
          <p className="mt-1 text-lg font-semibold text-white">Culto de Domingo</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          Ao vivo
        </span>
      </div>

      <div className="mt-6 flex items-center gap-6">
        {/* anel de presença — desenha do 0 ao 82% */}
        <div className="relative grid size-32 shrink-0 place-items-center">
          <svg viewBox="0 0 96 96" className="size-full -rotate-90" aria-hidden>
            <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="url(#ac-ring)"
              strokeWidth="8"
              strokeLinecap="round"
              className="animate-ring-draw"
              strokeDasharray="264"
              strokeDashoffset={47.5}
            />
            <defs>
              <linearGradient id="ac-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00C9E8" />
                <stop offset="55%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#6C43FF" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute text-center">
            <p className="text-2xl font-bold text-white tabular-nums">82%</p>
            <p className="text-[10px] tracking-wider text-white/40 uppercase">presença</p>
          </div>
        </div>

        {/* barras da semana */}
        <div className="flex h-36 flex-1 items-end gap-2">
          {HERO_BARS.map((bar, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div
                className="animate-bar-grow w-full max-w-6 rounded-t-md bg-gradient-to-t from-(--ac-blue)/60 to-(--ac-cyan)/90"
                style={{ height: `${bar.value}%`, animationDelay: `${450 + i * 90}ms` }}
              />
              <span className="text-[9px] font-medium text-white/35">{bar.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Presentes", value: "412" },
          { label: "Visitantes", value: "37" },
          { label: "Kids", value: "86" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-white tabular-nums">{item.value}</p>
            <p className="text-[10px] tracking-wide text-white/40 uppercase">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div
      className={cn(
        inter.className,
        "ac-landing min-h-screen bg-(--ac-navy) text-white antialiased selection:bg-(--ac-blue)/40 selection:text-white"
      )}
    >
      <ScrollProgress />
      <LandingHeader />

      <main>
        {/* ============================= HERO ============================= */}
        <section className="relative overflow-hidden pt-36 pb-20 lg:pt-44 lg:pb-28">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.055) 1px, transparent 1px)",
                backgroundSize: "54px 54px",
                maskImage: "radial-gradient(ellipse 85% 65% at 50% 35%, black 25%, transparent 75%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 85% 65% at 50% 35%, black 25%, transparent 75%)",
              }}
            />
            <div className="animate-aurora absolute -top-40 left-1/2 h-[520px] w-[880px] -translate-x-1/2 rounded-full bg-(--ac-blue)/20 blur-[140px]" />
            <div className="animate-glow absolute top-48 -left-40 h-96 w-96 rounded-full bg-(--ac-cyan)/10 blur-[120px] [animation-delay:1.2s]" />
            <div className="animate-glow absolute top-72 -right-40 h-96 w-96 rounded-full bg-(--ac-violet)/15 blur-[120px] [animation-delay:2.4s]" />
          </div>

          {/* marca d'água do símbolo */}
          <div aria-hidden className="pointer-events-none absolute -bottom-24 left-2 hidden opacity-[0.05] lg:block">
            <Image
              src="/brand/altar/altar-church_simbolo_escuro_v1.png"
              alt=""
              width={202}
              height={265}
              className="w-72"
            />
          </div>

          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            <div className="text-center lg:text-left">
              <div className="animate-fade-up">
                <span className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-white/80 uppercase backdrop-blur-md">
                  <span className="size-1.5 rounded-full bg-(--ac-cyan)" />
                  Gestão completa para igrejas
                </span>
              </div>

              <h1
                className="animate-fade-up mt-6 text-4xl leading-[1.08] font-bold tracking-tight text-white sm:text-5xl xl:text-6xl"
                style={{ animationDelay: "120ms" }}
              >
                Sua igreja conectada.
                <br />
                <span className="text-ac-gradient">Sua rotina organizada.</span>
              </h1>

              <p
                className="animate-fade-up mx-auto mt-6 max-w-xl text-base leading-relaxed text-(--ac-muted) sm:text-lg lg:mx-0"
                style={{ animationDelay: "240ms" }}
              >
                Membros, células, eventos, finanças, voluntários e kids em uma única plataforma.
                Mais clareza para a equipe — e mais tempo para cuidar de pessoas.
              </p>

              <div
                className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start"
                style={{ animationDelay: "360ms" }}
              >
                <Link
                  href="/register"
                  className="btn-shine group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-(--ac-blue) px-8 py-4 text-base font-semibold text-white shadow-[0_12px_40px_-8px_rgba(37,99,235,0.7)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_16px_50px_-6px_rgba(0,201,232,0.6)] focus-ring sm:w-auto"
                >
                  Começar agora
                  <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/10 focus-ring sm:w-auto"
                >
                  Já tenho conta
                </Link>
              </div>

              <dl
                className="animate-fade-up mx-auto mt-12 grid max-w-lg grid-cols-3 gap-6 lg:mx-0"
                style={{ animationDelay: "480ms" }}
              >
                <div className="text-center lg:text-left">
                  <dt className="sr-only">Módulos integrados</dt>
                  <dd className="text-3xl font-bold text-white">
                    <CountUp to={30} suffix="+" />
                  </dd>
                  <dd className="mt-1 text-xs leading-snug text-white/45">Módulos integrados</dd>
                </div>
                <div className="text-center lg:text-left">
                  <dt className="sr-only">Plataforma</dt>
                  <dd className="text-3xl font-bold text-white">PWA</dd>
                  <dd className="mt-1 text-xs leading-snug text-white/45">Web + app instalável</dd>
                </div>
                <div className="text-center lg:text-left">
                  <dt className="sr-only">Disponibilidade</dt>
                  <dd className="text-3xl font-bold text-white">24h</dd>
                  <dd className="mt-1 text-xs leading-snug text-white/45">Acesso de qualquer lugar</dd>
                </div>
              </dl>
            </div>

            {/* visual */}
            <div className="animate-fade-up relative mx-auto w-full max-w-lg" style={{ animationDelay: "300ms" }}>
              <div
                aria-hidden
                className="animate-spin-slow absolute -right-10 -bottom-14 size-40 rounded-full border border-dashed border-(--ac-cyan)/20 sm:size-56"
              />
              <HeroDashboard />

              <div className="animate-float absolute -top-12 -left-4 hidden rounded-2xl border border-white/10 bg-(--ac-surface)/95 p-4 shadow-2xl backdrop-blur-xl sm:block lg:-left-12">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-(--ac-cyan) to-(--ac-blue) text-[#091426]">
                    <MessageCircle className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Campanha enviada</p>
                    <p className="text-xs text-white/45">WhatsApp · 248 pessoas</p>
                  </div>
                </div>
              </div>

              <div
                className="animate-float absolute -bottom-12 -left-4 hidden rounded-2xl border border-white/10 bg-(--ac-surface)/95 p-4 shadow-2xl backdrop-blur-xl sm:block lg:-left-12"
                style={{ animationDelay: "1.5s" }}
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-(--ac-blue) to-(--ac-violet) text-white">
                    <QrCode className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Check-in confirmado</p>
                    <p className="text-xs text-white/45">Presença via QR Code</p>
                  </div>
                </div>
              </div>

              <div
                className="animate-float absolute -top-12 -right-4 hidden rounded-2xl border border-white/10 bg-(--ac-surface)/95 p-4 shadow-2xl backdrop-blur-xl sm:block lg:-right-12"
                style={{ animationDelay: "3s" }}
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-(--ac-navy)">
                    <Image
                      src="/brand/altar/altar-church_simbolo_escuro_v1.png"
                      alt=""
                      width={202}
                      height={265}
                      className="size-7"
                    />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">App PWA</p>
                    <p className="text-xs text-white/45">Instalável no celular</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================== MARQUEE =========================== */}
        <section aria-label="Módulos do sistema" className="border-y border-white/5 bg-white/[0.02] py-6">
          <div
            className="overflow-hidden"
            style={{
              maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
            }}
          >
            <div className="animate-marquee flex w-max items-center gap-10 pr-10">
              {[...MODULES, ...MODULES].map((mod, i) => (
                <span
                  key={`${mod.label}-${i}`}
                  className="inline-flex items-center gap-2.5 text-sm font-medium whitespace-nowrap text-(--ac-muted)"
                >
                  <mod.icon className="size-4 text-(--ac-cyan)" />
                  {mod.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ============================ PILARES =========================== */}
        <section className="relative border-b border-white/5 bg-(--ac-surface)/30 py-20 lg:py-24">
          <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 lg:grid-cols-3 lg:gap-8 lg:px-8">
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 120}>
                <div className="flex items-start gap-5">
                  <span className="text-ac-gradient mt-1 text-4xl font-bold tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="flex items-center gap-3">
                      <pillar.icon className="size-5 text-(--ac-cyan)" />
                      <h2 className="text-xl font-bold text-white">{pillar.title}</h2>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-(--ac-muted)">{pillar.description}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* =========================== RECURSOS =========================== */}
        <section id="recursos" className="relative scroll-mt-28 py-24 lg:py-32">
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 h-72 w-[720px] -translate-x-1/2 rounded-full bg-(--ac-blue)/10 blur-[130px]"
          />
          <div className="relative mx-auto w-full max-w-7xl px-5 lg:px-8">
            <SectionIntro
              kicker="Recursos"
              title="Tudo que sua igreja precisa para"
              gradient="crescer com ordem"
              description="Do primeiro visitante à multiplicação das células: uma plataforma pensada para a rotina real da igreja local."
            />

            <div className="mt-14 grid gap-5 lg:grid-cols-6">
              {/* destaque — Pessoa 360° */}
              <Reveal className="h-full lg:col-span-3">
                <article className="group relative h-full overflow-hidden rounded-3xl border border-white/8 bg-(--ac-surface)/40 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-(--ac-cyan)/30 hover:shadow-[0_20px_60px_-15px_rgba(0,201,232,0.3)]">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-(--ac-cyan) to-(--ac-blue) text-[#091426] shadow-[0_8px_24px_-6px_rgba(0,201,232,0.5)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                    <Contact className="size-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-white">Pessoa 360°</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-(--ac-muted)">
                    Cadastro, histórico e trilha de crescimento em uma única linha do tempo, com
                    follow-up pastoral, tarefas e prazos.
                  </p>
                  <ol className="mt-6 space-y-2.5" aria-label="Linha do tempo de exemplo">
                    {TIMELINE_360.map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs font-medium text-white/90">{item.label}</span>
                        <span className="ml-auto text-[11px] whitespace-nowrap text-white/40">
                          {item.when}
                        </span>
                      </li>
                    ))}
                  </ol>
                </article>
              </Reveal>

              {/* destaque — Comunicação multicanal */}
              <Reveal delay={100} className="h-full lg:col-span-3">
                <article className="group relative h-full overflow-hidden rounded-3xl border border-white/8 bg-(--ac-surface)/40 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-(--ac-violet)/40 hover:shadow-[0_20px_60px_-15px_rgba(108,67,255,0.35)]">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-(--ac-blue) to-(--ac-violet) text-white shadow-[0_8px_24px_-6px_rgba(108,67,255,0.5)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                    <Megaphone className="size-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-white">Comunicação multicanal</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-(--ac-muted)">
                    Campanhas de WhatsApp, e-mail e push para o público certo — célula, ministério,
                    aniversariantes ou lista manual — com status por destinatário.
                  </p>
                  <div className="mt-6 space-y-2.5" aria-label="Canais de envio de exemplo">
                    {CHANNELS.map((channel) => (
                      <div
                        key={channel.name}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5"
                      >
                        <span className="grid size-8 place-items-center rounded-lg bg-(--ac-blue)/15 text-(--ac-cyan)">
                          <channel.icon className="size-4" />
                        </span>
                        <span className="text-sm font-medium text-white/90">{channel.name}</span>
                        <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-(--ac-muted)">
                          {channel.meta}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </Reveal>

              {/* grade compacta */}
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={(i % 3) * 90} className="h-full lg:col-span-2">
                  <article className="group relative h-full overflow-hidden rounded-3xl border border-white/8 bg-(--ac-surface)/40 p-6 transition-all duration-500 hover:-translate-y-1 hover:border-(--ac-blue)/40 hover:shadow-[0_20px_60px_-15px_rgba(37,99,235,0.4)]">
                    <div
                      aria-hidden
                      className="absolute -top-16 -right-16 size-32 rounded-full bg-(--ac-blue)/0 blur-2xl transition-all duration-500 group-hover:bg-(--ac-blue)/15"
                    />
                    <span className="relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-(--ac-blue) to-(--ac-cyan) text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.6)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                      <feature.icon className="size-6" />
                    </span>
                    <h3 className="relative mt-5 text-base font-semibold text-white">{feature.title}</h3>
                    <p className="relative mt-2 text-sm leading-relaxed text-(--ac-muted)">
                      {feature.description}
                    </p>
                  </article>
                </Reveal>
              ))}

              {/* fechamento da grade */}
              <Reveal delay={180} className="h-full lg:col-span-4">
                <article className="relative h-full overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-(--ac-blue)/15 via-(--ac-surface)/40 to-(--ac-violet)/15 p-6">
                  <div className="flex h-full flex-col justify-between gap-6 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-base font-semibold text-white">E muito mais</h3>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-(--ac-muted)">
                        Sua igreja inteira em uma única plataforma — do cadastro de pessoas à
                        prestação de contas, com permissões por papel e auditoria.
                      </p>
                    </div>
                    <Link
                      href="/register"
                      className="group inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-(--ac-blue) px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_-6px_rgba(37,99,235,0.6)] transition-all duration-300 hover:shadow-[0_8px_40px_-4px_rgba(0,201,232,0.55)] focus-ring sm:self-center"
                    >
                      Começar agora
                      <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              </Reveal>
            </div>

            <Reveal delay={120} className="mt-10">
              <div className="flex flex-wrap items-center justify-center gap-3">
                {EXTRA_FEATURES.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/75 transition-colors duration-300 hover:border-(--ac-cyan)/30 hover:text-white"
                  >
                    <item.icon className="size-4 text-(--ac-cyan)" />
                    {item.label}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============================= KIDS ============================= */}
        <section id="kids" className="relative scroll-mt-28 overflow-hidden py-24 lg:py-32">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-(--ac-surface)/50 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/3 -left-32 h-96 w-96 rounded-full bg-(--ac-cyan)/10 blur-[130px]"
          />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-5 lg:grid-cols-2 lg:px-8">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-(--ac-cyan)/25 bg-(--ac-cyan)/10 px-4 py-1.5 text-xs font-bold tracking-[0.2em] text-(--ac-cyan) uppercase">
                <Baby className="size-3.5" />
                Altar Kids
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Um altar seguro para os{" "}
                <span className="bg-gradient-to-r from-(--ac-cyan) to-(--ac-blue) bg-clip-text text-transparent">
                  pequenos
                </span>
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-(--ac-muted) sm:text-lg">
                Do check-in na recepção ao chamado no painel dos pais, o Altar Kids cuida de cada
                detalhe para que as famílias vivam o culto com paz.
              </p>
              <ul className="mt-8 space-y-4">
                {KIDS_BULLETS.map((bullet, i) => (
                  <Reveal key={bullet} delay={i * 90}>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-(--ac-cyan)" />
                      <span className="text-sm leading-relaxed text-white/80 sm:text-base">{bullet}</span>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={150} className="relative mx-auto w-full max-w-md">
              <div className="relative rounded-3xl border border-white/10 bg-(--ac-surface)/70 p-6 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.9)] backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-(--ac-cyan) to-(--ac-blue) text-[#091426]">
                    <Baby className="size-7" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-white">Recepção Kids</p>
                    <p className="text-sm text-white/45">Sessão em andamento</p>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Ativo
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {KIDS_ROOMS.map((room) => (
                    <div key={room.name} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-white">{room.name}</span>
                        <span className="text-xs text-white/45">{room.count}</span>
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r from-(--ac-cyan) to-(--ac-blue) ${room.pct}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="animate-float absolute -top-7 -right-4 rounded-2xl border border-white/10 bg-(--ac-surface)/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:-right-8">
                <div className="flex items-center gap-2.5">
                  <QrCode className="size-5 text-(--ac-cyan)" />
                  <p className="text-sm font-semibold text-white">Check-in em 5 segundos</p>
                </div>
              </div>
              <div
                className="animate-float absolute -bottom-7 -left-4 rounded-2xl border border-white/10 bg-(--ac-surface)/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:-left-8"
                style={{ animationDelay: "2s" }}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="size-5 text-emerald-400" />
                  <p className="text-sm font-semibold text-white">Retirada só com etiqueta</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============================ PORTAIS =========================== */}
        <section id="portais" className="relative scroll-mt-28 py-24 lg:py-32">
          <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
            <SectionIntro
              kicker="Portais"
              title="Uma experiência para"
              gradient="cada pessoa da igreja"
              description="Do líder ao visitante, cada papel acessa o que precisa — no navegador ou instalado no celular como aplicativo."
            />

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {PORTALS.map((portal, i) => (
                <Reveal key={portal.title} delay={i * 110} className="h-full">
                  <article className="group relative h-full overflow-hidden rounded-3xl border border-white/8 bg-(--ac-surface)/40 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-(--ac-blue)/40 hover:shadow-[0_20px_60px_-15px_rgba(37,99,235,0.4)]">
                    <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-(--ac-blue) to-(--ac-cyan) text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.6)] transition-transform duration-500 group-hover:scale-110">
                      <portal.icon className="size-6" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-white">{portal.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-(--ac-muted)">{portal.description}</p>
                    <ul className="mt-5 space-y-2.5 border-t border-white/5 pt-5">
                      {portal.items.map((item) => (
                        <li key={item} className="flex items-center gap-2.5 text-sm text-white/75">
                          <Check className="size-4 shrink-0 text-(--ac-cyan)" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>

            <Reveal delay={140} className="mt-10 text-center">
              <p className="text-sm text-white/45">
                Tudo funciona como PWA instalável — sem passar pela loja de aplicativos.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ======================== COMO FUNCIONA ======================== */}
        <section id="como-funciona" className="relative scroll-mt-28 py-24 lg:py-32">
          <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
            <SectionIntro
              kicker="Como funciona"
              title="Sua igreja no ar em"
              gradient="três passos"
            />

            <div className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
              <div
                aria-hidden
                className="absolute top-8 right-[16%] left-[16%] hidden border-t-2 border-dashed border-white/10 md:block"
              />
              {STEPS.map((step, i) => (
                <Reveal key={step.number} delay={i * 140}>
                  <div className="group relative flex flex-col items-center text-center">
                    <span className="text-ac-gradient relative grid size-16 place-items-center rounded-2xl border border-white/10 bg-(--ac-surface)/80 text-xl font-bold shadow-[0_10px_35px_-10px_rgba(37,99,235,0.6)] transition-all duration-500 group-hover:scale-110 group-hover:border-(--ac-cyan)/40">
                      {step.number}
                    </span>
                    <h3 className="mt-6 text-xl font-semibold text-white">{step.title}</h3>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-(--ac-muted)">
                      {step.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============================= CTA ============================= */}
        <section className="relative px-5 pb-24 lg:px-8 lg:pb-32">
          <Reveal className="mx-auto w-full max-w-6xl">
            <div className="bg-ac-gradient rounded-3xl p-px shadow-[0_40px_120px_-30px_rgba(37,99,235,0.5)]">
              <div className="relative overflow-hidden rounded-[calc(1.5rem-1px)] bg-(--ac-navy) px-6 py-16 text-center sm:px-12 lg:py-20">
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                    maskImage: "radial-gradient(ellipse 70% 80% at 50% 50%, black 30%, transparent 80%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 70% 80% at 50% 50%, black 30%, transparent 80%)",
                  }}
                />
                <div
                  aria-hidden
                  className="animate-glow absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-(--ac-cyan)/15 blur-[110px]"
                />
                <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-16 opacity-[0.07]">
                  <Image
                    src="/brand/altar/altar-church_simbolo_escuro_v1.png"
                    alt=""
                    width={202}
                    height={265}
                    className="w-64"
                  />
                </div>
                <div className="relative">
                  <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                    Mais que um sistema.
                    <br />
                    <span className="text-ac-gradient">Um aliado para o Reino.</span>
                  </h2>
                  <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-(--ac-muted) sm:text-lg">
                    Igrejas mais fortes. Comunidades mais vivas. Um futuro com mais propósito.
                  </p>
                  <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <Link
                      href="/register"
                      className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-(--ac-navy) shadow-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl focus-ring sm:w-auto"
                    >
                      Criar conta grátis
                      <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex w-full items-center justify-center rounded-full border border-white/40 px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:bg-white/10 focus-ring sm:w-auto"
                    >
                      Já tenho conta
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ============================ FOOTER ============================ */}
      <footer className="border-t border-white/8 py-14">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 px-5 lg:px-8">
          <Image
            src="/brand/altar/altar-church_horizontal_escuro_v1.png"
            alt="Altar Church — Gestão completa para igrejas"
            width={784}
            height={265}
            className="h-8 w-auto"
          />
          <p className="text-xs font-semibold tracking-[0.3em] text-white/35 uppercase">
            Conectar • Cuidar • Multiplicar
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3" aria-label="Rodapé">
            <a href="#recursos" className="text-sm text-(--ac-muted) transition-colors hover:text-white">
              Recursos
            </a>
            <a href="#kids" className="text-sm text-(--ac-muted) transition-colors hover:text-white">
              Altar Kids
            </a>
            <a
              href="#portais"
              className="text-sm text-(--ac-muted) transition-colors hover:text-white"
            >
              Portais
            </a>
            <a
              href="#como-funciona"
              className="text-sm text-(--ac-muted) transition-colors hover:text-white"
            >
              Como funciona
            </a>
            <Link href="/login" className="text-sm text-(--ac-muted) transition-colors hover:text-white">
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-sm text-(--ac-muted) transition-colors hover:text-white"
            >
              Criar conta
            </Link>
          </nav>
          <p className="text-xs text-white/30">
            © 2026 Altar Church. Gestão completa para igrejas.
          </p>
        </div>
      </footer>
    </div>
  )
}
