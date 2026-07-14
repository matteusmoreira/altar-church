import { DashboardClient, type DashboardClientData } from "./dashboard-client"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/server"
import { getContentDashboardData } from "@/lib/content/data"
import { getGroupsDashboardData } from "@/lib/groups/data"
import { getPeopleDashboardData } from "@/lib/people/data"
import type { ContentDashboardData } from "@/lib/content/types"
import type { GroupDashboardData } from "@/lib/groups/types"
import type { PeopleDashboardData } from "@/lib/people/types"

async function safeRead<T>(reader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await reader()
  } catch {
    return fallback
  }
}

const emptyPeople: PeopleDashboardData = {
  total: 0,
  active: 0,
  visitors: 0,
  baptized: 0,
  emailValidated: 0,
  possibleDuplicates: 0,
}

const emptyGroups: GroupDashboardData = {
  total: 0,
  active: 0,
  inactive: 0,
  members: 0,
  capacity: 0,
  openCapacity: 0,
}

const emptyContent: ContentDashboardData = {
  categories: [],
  posts: [],
  banners: [],
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (user?.role === "volunteer") redirect("/voluntariado")
  const [people, groups, content] = await Promise.all([
    safeRead(getPeopleDashboardData, emptyPeople),
    safeRead(getGroupsDashboardData, emptyGroups),
    safeRead(getContentDashboardData, emptyContent),
  ])

  const publishedPosts = content.posts.filter((post) => post.status === "published").length
  const activeBanners = content.banners.filter((banner) => banner.isActive).length
  const dashboardData: DashboardClientData = {
    people,
    groups,
    content: {
      categories: content.categories.length,
      posts: content.posts.length,
      publishedPosts,
      activeBanners,
    },
    charts: {
      people: [
        { label: "Total", value: people.total },
        { label: "Ativos", value: people.active },
        { label: "Visitantes", value: people.visitors },
        { label: "Batizados", value: people.baptized },
      ],
      groups: [
        { label: "Grupos", value: groups.total },
        { label: "Ativos", value: groups.active },
        { label: "Membros", value: groups.members },
        { label: "Vagas", value: groups.openCapacity },
      ],
    },
  }

  return <DashboardClient data={dashboardData} />
}
