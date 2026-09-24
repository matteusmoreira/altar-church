"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Menu, X } from "lucide-react"

import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "#recursos", label: "Recursos" },
  { href: "#kids", label: "Altar Kids" },
  { href: "#portais", label: "Portais" },
  { href: "#como-funciona", label: "Como funciona" },
]

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "border-b border-white/10 bg-(--ac-navy)/85 py-3 shadow-[0_8px_40px_-12px_rgba(37,99,235,0.35)] backdrop-blur-xl"
          : "bg-transparent py-5"
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link
          href="/"
          aria-label="Altar Church - Início"
          className="rounded-control transition-opacity duration-300 hover:opacity-85 focus-ring"
        >
          <Image
            src="/brand/altar/altar-church_horizontal_escuro_v1.png"
            alt="Altar Church — Gestão completa para igrejas"
            width={784}
            height={265}
            priority
            className="h-8 w-auto sm:h-9"
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-(--ac-muted) transition-colors duration-200 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white/85 transition-colors duration-200 hover:text-white focus-ring"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="btn-shine group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-(--ac-blue) px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_-6px_rgba(37,99,235,0.6)] transition-all duration-300 hover:shadow-[0_8px_40px_-4px_rgba(0,201,232,0.55)] focus-ring"
          >
            Começar agora
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-md lg:hidden focus-ring"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-all duration-500 lg:hidden",
          open ? "max-h-[26rem] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <nav
          className="mx-5 mt-3 flex flex-col gap-1 rounded-2xl border border-white/10 bg-(--ac-surface)/95 p-4 backdrop-blur-xl"
          aria-label="Navegação móvel"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex gap-3 border-t border-white/10 pt-4">
            <Link
              href="/login"
              className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="flex-1 rounded-full bg-(--ac-blue) px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Começar agora
            </Link>
          </div>
        </nav>
      </div>
    </header>
  )
}
