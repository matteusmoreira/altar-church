import { getContentDashboardData } from "@/lib/content/data"
import type { ContentDashboardData } from "@/lib/content/types"
import {
  getGroupsDashboardData,
  listGroupMeetingReports,
  listGroups,
} from "@/lib/groups/data"
import type { GroupDashboardData, GroupListResult, GroupMeeting } from "@/lib/groups/types"
import { getPeopleDashboardData, listPeople } from "@/lib/people/data"
import type { PeopleDashboardData, PeopleListResult, PersonListItem } from "@/lib/people/types"
import { ReportsClient, type ReportsClientData } from "./reports-client"

const emptyPeopleDashboard: PeopleDashboardData = {
  total: 0,
  active: 0,
  visitors: 0,
  baptized: 0,
  emailValidated: 0,
  possibleDuplicates: 0,
}

const emptyPeopleList: PeopleListResult = {
  people: [],
  total: 0,
  page: 1,
  pageSize: 100,
  pageCount: 1,
}

const emptyGroupsDashboard: GroupDashboardData = {
  total: 0,
  active: 0,
  inactive: 0,
  members: 0,
  capacity: 0,
  openCapacity: 0,
}

const emptyGroupsList: GroupListResult = {
  groups: [],
  total: 0,
  page: 1,
  pageSize: 100,
  pageCount: 1,
}

const emptyContent: ContentDashboardData = {
  categories: [],
  posts: [],
  banners: [],
}

async function safeRead<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader()
  } catch {
    return fallback
  }
}

function getBirthdayMembers(people: PersonListItem[]) {
  const month = new Date().getMonth()
  return people.flatMap((person) => {
    if (!person.birthDate) return []
    if (new Date(`${person.birthDate}T00:00:00`).getMonth() !== month) return []

    return [{
      id: person.id,
      fullName: person.fullName,
      birthDate: person.birthDate,
      phone: person.phone,
    }]
  })
}

function summarizeVisitors(people: PersonListItem[]) {
  const converted = people.filter((person) => person.journeyStatus === "converted").length
  const inFollowUp = people.filter((person) =>
    ["new", "contacted", "following"].includes(person.journeyStatus)
  ).length

  return {
    total: people.length,
    converted,
    inFollowUp,
  }
}

function summarizeContent(content: ContentDashboardData) {
  return {
    categories: content.categories.length,
    posts: content.posts.length,
    publishedPosts: content.posts.filter((post) => post.status === "published").length,
    draftPosts: content.posts.filter((post) => post.status === "draft").length,
    activeBanners: content.banners.filter((banner) => banner.isActive).length,
    postTypes: ["news", "devotional", "ebd", "publication"].map((type) => ({
      label:
        type === "news"
          ? "Notícias"
          : type === "devotional"
            ? "Devocionais"
            : type === "ebd"
              ? "EBD"
              : "Publicações",
      value: content.posts.filter((post) => post.type === type).length,
    })),
  }
}

function summarizeMeetings(meetings: GroupMeeting[]) {
  const reported = meetings.filter((meeting) => meeting.reportStatus === "reported")
  const totalPresent = reported.reduce((total, meeting) => total + meeting.presentCount, 0)

  return {
    total: meetings.length,
    reported: reported.length,
    totalPresent,
    totalVisitors: reported.reduce((total, meeting) => total + meeting.visitorCount, 0),
    averagePresent: reported.length > 0 ? Math.round(totalPresent / reported.length) : 0,
  }
}

export default async function ReportsPage() {
  const [peopleDashboard, visitors, members, groupsDashboard, cells, meetings, content] = await Promise.all([
    safeRead(() => getPeopleDashboardData(), emptyPeopleDashboard),
    safeRead(() => listPeople({ personType: "visitor", pageSize: 100 }), emptyPeopleList),
    safeRead(() => listPeople({ personType: "member", pageSize: 100 }), emptyPeopleList),
    safeRead(() => getGroupsDashboardData(), emptyGroupsDashboard),
    safeRead(() => listGroups({ type: "cell", pageSize: 100 }), emptyGroupsList),
    safeRead(() => listGroupMeetingReports(), []),
    safeRead(() => getContentDashboardData(), emptyContent),
  ])

  const data: ReportsClientData = {
    people: peopleDashboard,
    visitors: summarizeVisitors(visitors.people),
    birthdayMembers: getBirthdayMembers(members.people),
    groups: groupsDashboard,
    cells: cells.groups.map((cell) => ({
      id: cell.id,
      name: cell.name,
      leaderName: cell.leaderName,
      meetingDay: cell.meetingDay,
      memberCount: cell.memberCount,
      maxCapacity: cell.maxCapacity,
      isActive: cell.isActive,
    })),
    meetings: meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      groupName: meeting.groupName,
      startsAt: meeting.startsAt,
      reportStatus: meeting.reportStatus,
      presentCount: meeting.presentCount,
      visitorCount: meeting.visitorCount,
    })),
    meetingSummary: summarizeMeetings(meetings),
    content: summarizeContent(content),
  }

  return <ReportsClient data={data} />
}
