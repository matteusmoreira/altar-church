"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCcw, Home } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PublicCellsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Erro na página pública de células:", error)
  }, [error])

  return (
    <div className="min-h-dvh w-full bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
      <div className="surface-raised max-w-md w-full p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center">
        <div className="h-14 w-14 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-5">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground mb-2">
          Não foi possível carregar as células
        </h1>

        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Ocorreu uma instabilidade temporária ao consultar os dados das células. Por favor, tente novamente em alguns instantes.
        </p>

        {error.digest && (
          <p className="text-[11px] font-mono text-muted-foreground mb-6 bg-muted/50 px-3 py-1 rounded-md border border-border/40">
            Código: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Button
            onClick={() => reset()}
            className="w-full sm:w-1/2 font-semibold flex items-center justify-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Tentar de novo</span>
          </Button>

          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-1/2 flex items-center justify-center gap-2"
            )}
          >
            <Home className="h-4 w-4" />
            <span>Início</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
