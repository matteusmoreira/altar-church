import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"

interface PageHeaderBack {
  href: string
  label: string
}

interface PageHeaderProps {
  title: string
  description?: string
  /** Optional leading icon rendered in a tinted tile. */
  icon?: React.ElementType
  /** Meta chips shown inline with the title (badges, counts, status). */
  badge?: React.ReactNode
  /** Optional back link rendered above the title. */
  back?: PageHeaderBack
  /** Right-aligned action row. `children` is accepted as an alias. */
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * Canonical page title block. Every page-level screen uses this instead of a
 * hand-rolled `<h1>`, so titles, descriptions and action rows line up across
 * modules. See DESIGN.md "Cabeçalho de página".
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  back,
  actions,
  children,
  className,
}: PageHeaderProps) {
  const actionSlot = actions ?? children

  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="focus-ring -ml-1 inline-flex items-center gap-1.5 rounded-control px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actionSlot && <div className="flex shrink-0 flex-wrap items-center gap-2">{actionSlot}</div>}
    </div>
  )
}
