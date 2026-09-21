import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  /**
   * `plain` — bare block inside an existing surface (default).
   * `card`  — draws its own dashed inset panel for use directly on the page.
   */
  variant?: "plain" | "card"
  className?: string
}

/**
 * Canonical "nothing here yet" block. Every module uses this so empty screens
 * share the same icon tile, type scale and call-to-action placement.
 * See DESIGN.md "Estados vazios".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "plain",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        variant === "card" && "surface-inset",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-panel bg-muted/60 ring-1 ring-inset ring-border/50">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
