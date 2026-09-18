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

export default function ChurchPublicError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Erro no portal público da igreja:", error)
  }, [error])

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full rounded-2xl border border-border/80 bg-card/80 p-8 shadow-xl backdrop-blur-xl flex flex-col items-center">
        <div className="h-14 w-14 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-5">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground mb-2">
          Instabilidade temporária
        </h1>

        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Não conseguimos carregar as informações do portal neste momento. Por favor, tente recarregar.
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
