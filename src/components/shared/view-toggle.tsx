"use client"

import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ViewToggleOption<TValue extends string = string> {
  value: TValue
  /** Visible text when `showLabel` is on; always used for `title`/`aria-label`. */
  label: string
  icon: LucideIcon
}

interface ViewToggleProps<TValue extends string = string> {
  value: TValue
  onChange: (value: TValue) => void
  options: ViewToggleOption<TValue>[]
  /** Show the text next to the icon instead of icon-only buttons. */
  showLabel?: boolean
  /** Group label, e.g. "Modo de visualização". */
  ariaLabel?: string
  className?: string
}

/**
 * Segmented control for list/grid/period switches. Replaces the four
 * hand-rolled toggle groups that each had different padding, radius and
 * active styling. See DESIGN.md "Controles segmentados".
 */
export function ViewToggle<TValue extends string = string>({
  value,
  onChange,
  options,
  showLabel = false,
  ariaLabel = "Modo de visualização",
  className,
}: ViewToggleProps<TValue>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-control border border-border/70 bg-muted/40 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size={showLabel ? "sm" : "icon-sm"}
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(showLabel && "gap-1.5 px-2.5 text-xs shadow-none")}
          >
            <option.icon className="h-4 w-4" />
            {showLabel && option.label}
          </Button>
        )
      })}
    </div>
  )
}
