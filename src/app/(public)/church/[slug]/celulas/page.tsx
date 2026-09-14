import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicCellsData } from "@/lib/cells/public-cells"
import { CellsMapExperience } from "@/components/public/cells/cells-map-experience"

interface PublicCellsPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PublicCellsPageProps): Promise<Metadata> {
  try {
    const { slug } = await params
    const data = await getPublicCellsData(slug)
    if (!data) return { title: "Células não encontradas" }

    const title = `Mapa 3D de Células | ${data.church.publicName}`
    const description = `Encontre a célula mais próxima de você em ${data.church.city || "sua cidade"}! Navegue pelo mapa 3D com encontros durante a semana da ${data.church.publicName}.`

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
  } catch {
    return { title: "Mapa 3D de Células | Altar Church" }
  }
}

export default async function PublicCellsPage({ params }: PublicCellsPageProps) {
  const { slug } = await params
  const data = await getPublicCellsData(slug)

  if (!data) {
    notFound()
  }

  return <CellsMapExperience initialData={data} />
}
