import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ShortcutCardProps {
  href: string
  icon: React.ElementType
  title: string
  description: string
  className?: string
}

export function ShortcutCard({ href, icon: Icon, title, description, className }: ShortcutCardProps) {
  return (
    <Link href={href}>
      <Card className={cn("glass cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/30", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  )
}
