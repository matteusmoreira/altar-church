import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type MetricTone = "primary" | "success" | "warning" | "info" | "destructive" | "neutral"
export type MetricVariant = "default" | "compact" | "executive"

/** Tint recipes per tone — one source of truth for every KPI tile in the app. */
const toneStyles: Record<MetricTone, string> = {
  primary: "bg-primary/10 text-primary ring-primary/15",
  success: "bg-success/10 text-success ring-success/15",
  warning: "bg-warning/15 text-warning-foreground ring-warning/20 dark:text-warning",
  info: "bg-info/10 text-info ring-info/15",
  destructive: "bg-destructive/10 text-destructive ring-destructive/15",
  neutral: "bg-muted text-muted-foreground ring-border/60",
}

const variantStyles: Record<MetricVariant, { content: string; value: string; title: string; tile: string; icon: string; surface: string }> = {
  default: {
    content: "p-5",
    value: "text-2xl",
    title: "text-sm font-medium",
    tile: "h-11 w-11 rounded-panel",
    icon: "h-5 w-5",
    surface: "glass",
  },
  compact: {
    content: "p-4",
    value: "text-xl",
    title: "text-sm font-medium",
    tile: "h-9 w-9 rounded-control",
    icon: "h-4 w-4",
    surface: "glass",
  },
  executive: {
    content: "p-4",
    value: "text-xl",
    title: "text-xs font-medium",
    tile: "h-7 w-7 rounded-control",
    icon: "h-3.5 w-3.5",
    surface: "bg-card/70",
  },
}

interface MetricCardProps {
  title: string
  value: string | number
  icon?: React.ElementType
  /** Small secondary line under the value (context, caption, comparison base). */
  hint?: string
  /** Status chip shown next to the value (e.g. "Revisar"). */
  badge?: React.ReactNode
  trend?: "up" | "down" | "flat"
  trendValue?: string
  tone?: MetricTone
  variant?: MetricVariant
  /** Renders the tile as a link. */
  href?: string
  /** Renders the tile as a button (click-to-filter metrics). */
  onClick?: () => void
  className?: string
}

/**
 * Single KPI tile used by every module. Replaces the eight hand-rolled stat
 * card variants that previously drifted across the dashboard. See DESIGN.md
 * "Cartões de métrica".
 */
export function MetricCard({
  title,
  value,
  icon: Icon,
  hint,
  badge,
  trend,
  trendValue,
  tone = "primary",
  variant = "default",
  href,
  onClick,
  className,
}: MetricCardProps) {
  const styles = variantStyles[variant]
  const interactive = Boolean(href || onClick)
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus
  const trendTone =
    trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"

  const inner = (
    <CardContent className={cn("flex items-start justify-between gap-3", styles.content)}>
      <div className="min-w-0 space-y-1">
        <p className={cn("text-muted-foreground", styles.title)}>{title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("font-bold tracking-tight tabular-nums", styles.value)}>{value}</p>
          {badge}
        </div>
        {trend && trendValue && (
          <p className={cn("flex items-center gap-1 text-xs font-medium", trendTone)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trendValue}
          </p>
        )}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <span className={cn("flex shrink-0 items-center justify-center ring-1 ring-inset", styles.tile, toneStyles[tone])}>
          <Icon className={styles.icon} />
        </span>
      )}
    </CardContent>
  )

  const cardClassName = cn(
    "gap-0 py-0",
    styles.surface,
    interactive &&
      "focus-ring transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-elevation-2 motion-reduce:hover:translate-y-0",
    className,
  )

  if (href) {
    return (
      <Link href={href} className="focus-ring block rounded-card">
        <Card className={cardClassName}>{inner}</Card>
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="focus-ring block w-full rounded-card text-left">
        <Card className={cardClassName}>{inner}</Card>
      </button>
    )
  }

  return <Card className={cardClassName}>{inner}</Card>
}
