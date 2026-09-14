import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicChurchData } from "@/lib/content/data"
import { AcquisitionBeacon } from "@/components/public/acquisition-beacon"
import { ChurchPublicHeader } from "@/components/public/church/church-public-header"
import { ChurchPortalClient } from "@/components/public/church/church-portal-client"
import Link from "next/link"

type PublicChurchPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}

export async function generateMetadata({ params }: PublicChurchPageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicChurchData(slug)
  if (!data) return { title: "Igreja não encontrada | Altar Church" }

  const title = `${data.church.publicName} | Portal Oficial`
  const description =
    data.church.history || `Portal oficial da ${data.church.publicName}. Cultos, eventos, células e avisos.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: data.church.publicName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function PublicChurchPage({ params, searchParams }: PublicChurchPageProps) {
  const { slug } = await params
  const resolvedSearchParams = await searchParams
  const initialTab =
    typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab : "tudo"

  const data = await getPublicChurchData(slug)

  if (!data) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary transition-colors duration-300">
      {/* Marketing / UTM Tracker */}
      <AcquisitionBeacon companySlug={data.church.slug} />

      {/* Modern Sticky Glassmorphism Header */}
      <ChurchPublicHeader churchName={data.church.publicName} slug={data.church.slug} />

      {/* Main Interactive SuperApp Portal Experience */}
      <ChurchPortalClient data={data} initialTab={initialTab} />

      {/* Refined Footer */}
      <footer className="border-t border-border/40 bg-card/40 py-8 text-center text-xs text-muted-foreground transition-colors mb-20 md:mb-0">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-medium">
            {data.church.publicName} © {new Date().getFullYear()} • Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Acesso Administrativo
            </Link>
            <span>•</span>
            <a
              href="https://altarchurch.com.br"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground font-semibold text-primary transition-colors"
            >
              Tecnologia Altar Church
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
