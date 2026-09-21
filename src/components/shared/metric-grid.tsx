import { cn } from "@/lib/utils"

const columnsByCount = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
} as const

interface MetricGridProps {
  /** Column count at the widest breakpoint. Collapses to 1 column on mobile. */
  columns?: keyof typeof columnsByCount
  children: React.ReactNode
  className?: string
}

/**
 * Standard grid for `MetricCard` rows. Owns the gap and the collapse
 * breakpoints so KPI rows stop drifting between `gap-3`/`gap-4` and
 * `lg:`/`xl:` column counts. See DESIGN.md "Grades".
 */
export function MetricGrid({ columns = 4, children, className }: MetricGridProps) {
  return <div className={cn("grid gap-4", columnsByCount[columns], className)}>{children}</div>
}
