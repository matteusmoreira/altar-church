import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ElementType
  trend?: "up" | "down"
  trendValue?: string
  color?: string
  className?: string
}

export function MetricCard({ title, value, icon: Icon, trend, trendValue, color = "gradient-primary", className }: MetricCardProps) {
  return (
    <Card className={cn("glass overflow-hidden py-0", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && trendValue && (
              <div className="flex items-center gap-1">
                <span className={cn("text-xs font-medium", trend === "up" ? "text-success" : "text-destructive")}>
                  {trend === "up" ? "↑" : "↓"} {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
