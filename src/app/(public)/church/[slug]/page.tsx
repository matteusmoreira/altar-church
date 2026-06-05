import Link from "next/link"
import { notFound } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BookOpen,
  CalendarDays,
  Church,
  Clock,
  Heart,
  Mail,
  MapPin,
  MapPinned,
  Phone,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPublicChurchData } from "@/lib/content/data"
import type { ContentPost } from "@/lib/content/types"

type PublicChurchPageProps = {
  params: Promise<{ slug: string }>
}

function formatDate(value: string | null) {
  if (!value) return ""
  return format(parseISO(value), "dd 'de' MMMM", { locale: ptBR })
}

function postTypeLabel(post: ContentPost) {
  const labels: Record<ContentPost["type"], string> = {
    news: "Notícia",
    devotional: "Devocional",
    ebd: "EBD",
    publication: "Publicação",
  }
  return labels[post.type]
}

export default async function PublicChurchPage({ params }: PublicChurchPageProps) {
  const { slug } = await params
  const data = await getPublicChurchData(slug)

  if (!data) {
    notFound()
  }

  const heroBanner = data.banners[0]

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border/50 bg-foreground text-background">
        <div className="mx-auto grid min-h-[82vh] max-w-6xl content-center gap-10 px-4 py-12 md:grid-cols-[1.25fr_0.75fr] md:py-16">
          <div className="space-y-7">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background text-foreground">
              <Church className="h-8 w-8" />
            </div>
            <div className="max-w-3xl space-y-4">
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{data.church.publicName}</h1>
              <p className="text-lg text-background/75 md:text-xl">
                {data.church.history || "Uma comunidade para servir, discipular e caminhar em comunhão."}
              </p>
            </div>
            <div className="flex flex-col gap-3 text-sm text-background/70 sm:flex-row sm:flex-wrap">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {data.church.address}, {data.church.city} - {data.church.state}
              </span>
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {data.church.phone}
              </span>
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {data.church.email}
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className={buttonVariants({ size: "lg", className: "bg-background text-foreground hover:bg-background/90" })}>
                Acessar sistema
              </Link>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.church.address}, ${data.church.city} - ${data.church.state}`)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "lg", className: "border-background/30 text-background hover:bg-background/10" })}
              >
                <MapPinned className="mr-2 h-4 w-4" />
                Como chegar
              </a>
            </div>
          </div>

          <Card className="self-end border-background/20 bg-background/10 text-background shadow-none backdrop-blur">
            <CardHeader>
              <Badge className="w-fit bg-background text-foreground">{heroBanner ? "Destaque" : "Bem-vindo"}</Badge>
              <CardTitle className="text-2xl">{heroBanner?.title ?? "Portal da igreja"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-background/75">
                Conteúdo, programação, ministérios e informações públicas conectadas ao cadastro real da igreja.
              </p>
              {heroBanner?.linkUrl && (
                <Link href={heroBanner.linkUrl} className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                  Ver chamada
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Conteúdos recentes</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.posts.map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">{postTypeLabel(post)}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</span>
                  </div>
                  <CardTitle className="text-lg">{post.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-3 text-sm text-muted-foreground">{post.summary || post.content}</p>
                  {post.authorName && <p className="text-xs text-muted-foreground">Por {post.authorName}</p>}
                </CardContent>
              </Card>
            ))}
            {data.posts.length === 0 && (
              <Card className="md:col-span-3">
                <CardContent className="p-8 text-center text-muted-foreground">Nenhum conteúdo publicado ainda.</CardContent>
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold">Programação</h2>
            </div>
            <div className="grid gap-4">
              {data.programmings.map((programming) => (
                <Card key={programming.id}>
                  <CardContent className="flex items-start gap-4 p-5">
                    <Clock className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-semibold">{programming.title}</h3>
                      <p className="text-sm text-muted-foreground">{programming.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDate(programming.startsAt)} {programming.isLive ? "• Ao vivo" : ""}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {data.programmings.length === 0 && <p className="text-sm text-muted-foreground">Programação ainda não publicada.</p>}
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Heart className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold">Ministérios</h2>
            </div>
            <div className="grid gap-4">
              {data.ministries.map((ministry) => (
                <Card key={ministry.id}>
                  <CardContent className="p-5">
                    <h3 className="font-semibold">{ministry.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{ministry.description}</p>
                    {ministry.leaderName && <p className="mt-3 text-xs text-muted-foreground">Liderança: {ministry.leaderName}</p>}
                  </CardContent>
                </Card>
              ))}
              {data.ministries.length === 0 && <p className="text-sm text-muted-foreground">Ministérios ainda não publicados.</p>}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Congregações</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.congregations.map((congregation) => (
              <Card key={congregation.id}>
                <CardContent className="p-5">
                  <h3 className="font-semibold">{congregation.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{congregation.address}</p>
                  <p className="mt-3 text-xs text-muted-foreground">Responsável: {congregation.responsible}</p>
                </CardContent>
              </Card>
            ))}
            {data.congregations.length === 0 && <p className="text-sm text-muted-foreground">Congregações ainda não publicadas.</p>}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-6 text-center text-sm text-muted-foreground">
        <p>{data.church.publicName} © {new Date().getFullYear()} • EcclesiaHub</p>
      </footer>
    </div>
  )
}
