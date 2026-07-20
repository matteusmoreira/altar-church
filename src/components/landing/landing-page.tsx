import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Baby,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Church,
  ClipboardCheck,
  DollarSign,
  HandHeart,
  Megaphone,
  Music,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react"

import { LandingHeader } from "@/components/landing/landing-header"
import { Reveal } from "@/components/landing/reveal"

const MODULES = [
  { icon: Users, label: "Pessoas & Membros" },
  { icon: UsersRound, label: "Células & GCeus" },
  { icon: CalendarDays, label: "Eventos" },
  { icon: QrCode, label: "Presença QR" },
  { icon: DollarSign, label: "Financeiro" },
  { icon: HandHeart, label: "Doações" },
  { icon: ClipboardCheck, label: "Voluntariado" },
  { icon: Baby, label: "Kids" },
  { icon: Music, label: "Louvor" },
  { icon: Megaphone, label: "Comunicação" },
  { icon: BookOpen, label: "Discipulado" },
  { icon: BarChart3, label: "Relatórios" },
  { icon: Building2, label: "Congregações" },
  { icon: ShieldCheck, label: "Segurança" },
]

const FEATURES = [
  {
    icon: Users,
    title: "Pessoas & Membros",
    description:
      "Cadastro completo de membros, visitantes e famílias, com histórico, trilha de crescimento e CRM pastoral.",
  },
  {
    icon: UsersRound,
    title: "Células & GCeus",
    description:
      "Gestão de pequenos grupos com relatórios semanais, presença, multiplicação e supervisão em tempo real.",
  },
  {
    icon: CalendarDays,
    title: "Eventos & Programação",
    description:
      "Agenda da igreja, inscrições, programações detalhadas e check-in — tudo sincronizado com a equipe.",
  },
  {
    icon: QrCode,
    title: "Presença com QR Code",
    description:
      "Chamada inteligente por QR Code e relatórios de frequência que revelam o pulso da sua igreja.",
  },
  {
    icon: DollarSign,
    title: "Financeiro & Doações",
    description:
      "Dízimos, ofertas, campanhas e prestação de contas com transparência, categorias e exportações auditadas.",
  },
  {
    icon: ClipboardCheck,
    title: "Voluntariado & Escalas",
    description:
      "Escalas inteligentes por ministério, confirmação de presença e notificações automáticas para voluntários.",
  },
  {
    icon: Baby,
    title: "Altar Kids",
    description:
      "Check-in seguro com QR e etiquetas, salas, chamada em tempo real e o Portal da Família para os pais.",
  },
  {
    icon: Music,
    title: "Louvor & Setlists",
    description:
      "Repertório de músicas, setlists organizados e escalas do ministério de louvor em um só lugar.",
  },
]

const EXTRA_FEATURES = [
  { icon: Megaphone, label: "Comunicação & avisos" },
  { icon: HandHeart, label: "Intercessão & oração" },
  { icon: BookOpen, label: "Discipulado & trilhas" },
  { icon: BarChart3, label: "Relatórios gerenciais" },
  { icon: Building2, label: "Multi-congregações" },
  { icon: Smartphone, label: "App PWA instalável" },
]

const KIDS_BULLETS = [
  "Check-in com QR Code e etiqueta impressa na hora",
  "Portal da Família: pais acompanham tudo pelo celular",
  "Chamada em sala e painel de recepção em tempo real",
  "Comunicação direta com os pais durante o culto",
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

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050917] font-sans text-slate-300 antialiased selection:bg-blue-500/30 selection:text-white">
      <LandingHeader />

      {/* ============================= HERO ============================= */}
      <section className="relative overflow-hidden pt-36 pb-20 lg:pt-44 lg:pb-28">
        {/* fundo decorativo */}
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
          <div className="animate-glow absolute -top-32 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[140px]" />
          <div className="animate-glow absolute top-40 -left-40 h-96 w-96 rounded-full bg-sky-500/15 blur-[120px] [animation-delay:1.2s]" />
          <div className="animate-glow absolute top-64 -right-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-[120px] [animation-delay:2.4s]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          {/* texto */}
          <div className="text-center lg:text-left">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-sky-300 uppercase backdrop-blur-md">
                <Sparkles className="size-3.5 text-amber-300" />
                Conectar • Cuidar • Multiplicar
              </span>
            </div>

            <h1
              className="animate-fade-up mt-6 text-4xl leading-[1.08] font-bold tracking-tight text-white sm:text-5xl xl:text-6xl"
              style={{ animationDelay: "120ms" }}
            >
              A gestão completa da sua igreja,{" "}
              <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                em um só altar
              </span>
            </h1>

            <p
              className="animate-fade-up mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg lg:mx-0"
              style={{ animationDelay: "240ms" }}
            >
              Membros, células, eventos, finanças, voluntários, kids e louvor — o Altar Church
              centraliza toda a operação da sua igreja para você focar no que realmente importa:
              pessoas.
            </p>

            <div
              className="animate-fade-up mt-9 flex flex-col items-center gap-4 sm:flex-row lg:justify-start sm:justify-center"
              style={{ animationDelay: "360ms" }}
            >
              <Link
                href="/register"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-8 py-4 text-base font-semibold text-white shadow-[0_12px_40px_-8px_rgba(37,99,235,0.7)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_16px_50px_-6px_rgba(56,189,248,0.75)] sm:w-auto"
              >
                Começar agora
                <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/10 sm:w-auto"
              >
                Acessar sistema
              </Link>
            </div>

            <dl
              className="animate-fade-up mx-auto mt-12 grid max-w-lg grid-cols-3 gap-6 lg:mx-0"
              style={{ animationDelay: "480ms" }}
            >
              {[
                { value: "30+", label: "Módulos integrados" },
                { value: "100%", label: "Web + app PWA" },
                { value: "24h", label: "Acesso de qualquer lugar" },
              ].map((stat) => (
                <div key={stat.label} className="text-center lg:text-left">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="bg-gradient-to-br from-white to-sky-300 bg-clip-text text-3xl font-bold text-transparent">
                    {stat.value}
                  </dd>
                  <dd className="mt-1 text-xs leading-snug text-slate-500">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* visual */}
          <div className="animate-fade-up relative mx-auto w-full max-w-lg" style={{ animationDelay: "300ms" }}>
            <div
              aria-hidden
              className="animate-spin-slow absolute -right-10 -bottom-14 size-40 rounded-full border border-dashed border-sky-400/20 sm:size-56"
            />
            {/* painel principal */}
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.9)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
                    Visão geral
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">Culto de Domingo</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Ao vivo
                </span>
              </div>

              <div className="mt-6 flex items-end gap-6">
                <div className="relative grid size-28 shrink-0 place-items-center">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "conic-gradient(#38bdf8 0deg 295deg, rgba(255,255,255,0.07) 295deg 360deg)",
                    }}
                  />
                  <div className="absolute inset-[7px] rounded-full bg-[#0a1130]" />
                  <div className="relative text-center">
                    <p className="text-2xl font-bold text-white">82%</p>
                    <p className="text-[10px] tracking-wider text-slate-500 uppercase">presença</p>
                  </div>
                </div>
                <div className="flex h-28 flex-1 items-end gap-2">
                  {[42, 58, 50, 72, 64, 88, 96].map((height, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-md bg-gradient-to-t from-blue-600/60 to-sky-400/90 transition-all duration-500 hover:from-blue-500 hover:to-sky-300"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Presentes", value: "412" },
                  { label: "Visitantes", value: "37" },
                  { label: "Kids", value: "86" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-center"
                  >
                    <p className="text-lg font-bold text-white">{item.value}</p>
                    <p className="text-[10px] tracking-wide text-slate-500 uppercase">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* cartões flutuantes */}
            <div className="animate-float absolute -top-12 -left-4 hidden rounded-2xl border border-white/10 bg-[#0a1130]/90 p-4 shadow-2xl backdrop-blur-xl sm:block lg:-left-12">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-400 text-white">
                  <QrCode className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Check-in confirmado</p>
                  <p className="text-xs text-slate-500">Presença via QR Code</p>
                </div>
              </div>
            </div>

            <div
              className="animate-float absolute -bottom-12 -left-4 hidden rounded-2xl border border-white/10 bg-[#0a1130]/90 p-4 shadow-2xl backdrop-blur-xl sm:block lg:-left-12"
              style={{ animationDelay: "1.5s" }}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 text-[#050917]">
                  <Baby className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Kids • Sala Segura</p>
                  <p className="text-xs text-slate-500">Etiqueta impressa ✓</p>
                </div>
              </div>
            </div>

            <div
              className="animate-float absolute -top-12 -right-4 hidden rounded-2xl border border-white/10 bg-[#0a1130]/90 p-4 shadow-2xl backdrop-blur-xl sm:block lg:-right-12"
              style={{ animationDelay: "3s" }}
            >
              <div className="flex items-center gap-3">
                <Image
                  src="/icons/icon-192.png"
                  alt="Ícone do app Altar Church"
                  width={40}
                  height={40}
                  className="size-10 rounded-xl"
                />
                <div>
                  <p className="text-sm font-semibold text-white">App PWA</p>
                  <p className="text-xs text-slate-500">Instalável no celular</p>
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
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div className="animate-marquee flex w-max items-center gap-10 pr-10">
            {[...MODULES, ...MODULES].map((mod, i) => (
              <span
                key={`${mod.label}-${i}`}
                className="inline-flex items-center gap-2.5 text-sm font-medium whitespace-nowrap text-slate-400"
              >
                <mod.icon className="size-4 text-sky-400" />
                {mod.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== RECURSOS =========================== */}
      <section id="recursos" className="relative scroll-mt-28 py-24 lg:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 h-72 w-[720px] -translate-x-1/2 rounded-full bg-blue-700/10 blur-[130px]"
        />
        <div className="relative mx-auto w-full max-w-7xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold tracking-[0.25em] text-sky-400 uppercase">
              Recursos
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Tudo que sua igreja precisa para{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                crescer com ordem
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">
              Do primeiro visitante à multiplicação das células: uma plataforma pensada para a
              rotina real da igreja local.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => (
              <Reveal key={feature.title} delay={(i % 4) * 90}>
                <article className="group relative h-full overflow-hidden rounded-3xl border border-white/8 bg-white/[0.03] p-6 transition-all duration-500 hover:-translate-y-1.5 hover:border-sky-400/30 hover:bg-white/[0.05] hover:shadow-[0_20px_60px_-15px_rgba(37,99,235,0.45)]">
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 size-32 rounded-full bg-sky-500/0 blur-2xl transition-all duration-500 group-hover:bg-sky-500/15"
                  />
                  <span className="relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.6)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                    <feature.icon className="size-6" />
                  </span>
                  <h3 className="relative mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="relative mt-2.5 text-sm leading-relaxed text-slate-400">
                    {feature.description}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120} className="mt-10">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {EXTRA_FEATURES.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition-colors duration-300 hover:border-sky-400/30 hover:text-white"
                >
                  <item.icon className="size-4 text-sky-400" />
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#0a1230]/60 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/3 -left-32 h-96 w-96 rounded-full bg-amber-400/8 blur-[130px]"
        />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-5 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-1.5 text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">
              <Baby className="size-3.5" />
              Altar Kids
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Um altar seguro para os{" "}
              <span className="bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">
                pequenos
              </span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
              Do check-in na recepção ao chamado no painel dos pais, o Altar Kids cuida de cada
              detalhe para que as famílias vivam o culto com paz.
            </p>
            <ul className="mt-8 space-y-4">
              {KIDS_BULLETS.map((bullet, i) => (
                <Reveal key={bullet} delay={i * 90}>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-amber-300" />
                    <span className="text-sm leading-relaxed text-slate-300 sm:text-base">
                      {bullet}
                    </span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150} className="relative mx-auto w-full max-w-md">
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.9)] backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-[#050917]">
                  <Baby className="size-7" />
                </span>
                <div>
                  <p className="text-lg font-semibold text-white">Recepção Kids</p>
                  <p className="text-sm text-slate-500">Sessão em andamento</p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Ativo
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  { name: "Sala Maternal", count: "12 crianças", pct: "w-3/4" },
                  { name: "Sala Jardim", count: "24 crianças", pct: "w-full" },
                  { name: "Sala Juniores", count: "18 crianças", pct: "w-5/6" },
                ].map((room) => (
                  <div key={room.name} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-white">{room.name}</span>
                      <span className="text-xs text-slate-500">{room.count}</span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 ${room.pct}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-float absolute -top-7 -right-4 rounded-2xl border border-white/10 bg-[#0a1130]/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:-right-8">
              <div className="flex items-center gap-2.5">
                <QrCode className="size-5 text-amber-300" />
                <p className="text-sm font-semibold text-white">Check-in em 5 segundos</p>
              </div>
            </div>
            <div
              className="animate-float absolute -bottom-7 -left-4 rounded-2xl border border-white/10 bg-[#0a1130]/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:-left-8"
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

      {/* ======================== COMO FUNCIONA ======================== */}
      <section id="como-funciona" className="relative scroll-mt-28 py-24 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold tracking-[0.25em] text-sky-400 uppercase">
              Como funciona
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Sua igreja no ar em{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                três passos
              </span>
            </h2>
          </Reveal>

          <div className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
            <div
              aria-hidden
              className="absolute top-8 right-[16%] left-[16%] hidden border-t-2 border-dashed border-white/10 md:block"
            />
            {STEPS.map((step, i) => (
              <Reveal key={step.number} delay={i * 140}>
                <div className="group relative flex flex-col items-center text-center">
                  <span className="relative grid size-16 place-items-center rounded-2xl border border-sky-400/25 bg-gradient-to-br from-[#0a1230] to-[#101c48] text-xl font-bold text-sky-300 shadow-[0_10px_35px_-10px_rgba(37,99,235,0.6)] transition-all duration-500 group-hover:scale-110 group-hover:border-sky-400/50">
                    {step.number}
                  </span>
                  <h3 className="mt-6 text-xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
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
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 px-6 py-16 text-center shadow-[0_40px_120px_-30px_rgba(37,99,235,0.8)] sm:px-12 lg:py-20">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage: "radial-gradient(ellipse 70% 80% at 50% 50%, black 30%, transparent 80%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 70% 80% at 50% 50%, black 30%, transparent 80%)",
              }}
            />
            <div
              aria-hidden
              className="animate-glow absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-sky-300/25 blur-[110px]"
            />
            <div className="relative">
              <Church className="mx-auto size-12 text-white/85" />
              <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Pronto para transformar a gestão da sua igreja?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-blue-100 sm:text-lg">
                Junte-se às igrejas que já organizam membros, células, finanças e kids no Altar
                Church. Comece hoje — é simples, rápido e feito para você.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-blue-700 shadow-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl sm:w-auto"
                >
                  Criar conta grátis
                  <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/40 px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:bg-white/10 sm:w-auto"
                >
                  Já tenho conta
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer className="border-t border-white/8 py-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 px-5 lg:px-8">
          <span className="flex items-center rounded-full bg-white px-5 py-2.5 shadow-[0_4px_24px_-6px_rgba(59,130,246,0.4)]">
            <Image
              src="/brand/logo-reduzida.png"
              alt="Altar Church"
              width={369}
              height={175}
              className="h-8 w-auto"
            />
          </span>
          <p className="text-xs font-semibold tracking-[0.3em] text-slate-500 uppercase">
            Conectar • Cuidar • Multiplicar
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3" aria-label="Rodapé">
            <a href="#recursos" className="text-sm text-slate-400 transition-colors hover:text-white">
              Recursos
            </a>
            <a href="#kids" className="text-sm text-slate-400 transition-colors hover:text-white">
              Altar Kids
            </a>
            <a
              href="#como-funciona"
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              Como funciona
            </a>
            <Link href="/login" className="text-sm text-slate-400 transition-colors hover:text-white">
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              Criar conta
            </Link>
          </nav>
          <p className="text-xs text-slate-600">
            © 2026 Altar Church. Sistema de gestão completa para igrejas.
          </p>
        </div>
      </footer>
    </div>
  )
}
