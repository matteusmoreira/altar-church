import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  description?: string
  /** Right-aligned control (link, button, view toggle, count badge). */
  action?: React.ReactNode
  className?: string
}

/**
 * Title block for a section inside a page — the level below `PageHeader`.
 * Keeps section titles on one type scale instead of the mix of `text-lg`,
 * `text-xl` and `text-base` found before. See DESIGN.md "Hierarquia".
 */
export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
