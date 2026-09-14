import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ShortcutCardProps {
  href: string
  icon: React.ElementType
  title: string
  description: string
  className?: string
  target?: string
  badge?: string
}

export function ShortcutCard({ href, icon: Icon, title, description, className, target, badge }: ShortcutCardProps) {
  return (
    <Link href={href} target={target} rel={target === "_blank" ? "noopener noreferrer" : undefined}>
      <Card className={cn("glass cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/30", className)}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            {badge && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                {badge}
              </span>
            )}
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  )
}
