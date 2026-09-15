import type {
  VolunteerDashboardData,
  VolunteerPortalData,
  VolunteerAssignment,
  VolunteerShift,
} from "./types";

// Entirely fictional data. The preview route is unavailable in production.
export function volunteerPreviewData() {
  const month = "2026-09";
  const people = ["Ana Oliveira", "Bruno Santos", "Carla Lima", "Daniel Souza"];
  const volunteers: VolunteerDashboardData["volunteers"] = people.map(
    (name, index) => ({
      id: `demo-person-${index}`,
      personId: `demo-person-${index}`,
      profileId: null,
      name,
      email: null,
      phone: "",
      status: "active",
      active: true,
      whatsappEnabled: true,
      emailEnabled: false,
      departmentNames: [index < 2 ? "Recepção" : "Mídia"],
      assignments: index + 1,
      checkins: index,
      lastParticipationAt: null,
      desiredServicesPerMonth: 2,
      maxServicesPerMonth: 4,
      minimumRestHours: 12,
      validatedAt: null,
      memberships: [
        {
          id: `membership-${index}`,
          departmentId: index < 2 ? "reception" : "media",
          departmentName: index < 2 ? "Recepção" : "Mídia",
          roleName: index < 2 ? "Recepcionar" : "Projeção",
          roleId: index < 2 ? "welcome" : "slides",
          active: true,
        },
      ],
    }),
  );
  const departments: VolunteerDashboardData["departments"] = [
    {
      id: "reception",
      name: "Recepção",
      description: "Acolhimento de membros e visitantes",
      managerProfileId: null,
      active: true,
      roles: [
        {
          id: "welcome",
          departmentId: "reception",
          name: "Recepcionar",
          description: "",
          instructions: "Chegar 20 minutos antes.",
          active: true,
        },
      ],
    },
    {
      id: "media",
      name: "Mídia",
      description: "Projeção e transmissão",
      managerProfileId: null,
      active: true,
      roles: [
        {
          id: "slides",
          departmentId: "media",
          name: "Projeção",
          description: "",
          instructions: "Conferir a apresentação antes do culto.",
          active: true,
        },
      ],
    },
  ];
  const assignment = (
    index: number,
    status: VolunteerAssignment["status"],
    suffix: string,
  ): VolunteerAssignment => ({
    id: `assignment-${index}-${suffix}`,
    volunteerId: volunteers[index].id,
    volunteerName: people[index],
    status,
    checkedInAt: null,
    checkedOutAt: null,
    score: 150,
    scoreReasons: [
      { code: "available", label: "Disponível", points: 100 },
      {
        code: "balanced_load",
        label: "Serve menos vezes neste mês",
        points: 40,
      },
    ],
    locked: false,
    declineReason: status === "declined" ? "Viagem em família" : null,
    deliveries:
      status === "proposed"
        ? []
        : [
            {
              channel: "whatsapp",
              status: index === 0 ? "delivered" : "queued",
            },
          ],
  });
  const shifts: VolunteerShift[] = [
    {
      id: "shift-1",
      eventId: "event-1",
      eventTitle: "Culto de domingo",
      departmentId: "reception",
      departmentName: "Recepção",
      roleName: "Recepcionar",
      requiredVolunteers: 3,
      startsAt: `${month}-20T21:00:00Z`,
      endsAt: `${month}-20T23:00:00Z`,
      checkinOpensAt: `${month}-20T20:00:00Z`,
      checkinClosesAt: `${month}-20T23:00:00Z`,
      instructions: "Chegar 20 minutos antes para receber os visitantes.",
      unreadChatCount: 0,
      assignments: [assignment(0, "proposed", "1")],
    },
    {
      id: "shift-2",
      eventId: "event-2",
      eventTitle: "Culto da família",
      departmentId: "reception",
      departmentName: "Recepção",
      roleName: "Recepcionar",
      requiredVolunteers: 2,
      startsAt: `${month}-27T21:00:00Z`,
      endsAt: `${month}-27T23:00:00Z`,
      checkinOpensAt: `${month}-27T20:00:00Z`,
      checkinClosesAt: `${month}-27T23:00:00Z`,
      instructions: "Organizar a recepção e orientar as famílias.",
      unreadChatCount: 0,
      assignments: [
        assignment(0, "notified", "2"),
        assignment(1, "confirmed", "2"),
      ],
    },
    {
      id: "shift-3",
      eventId: "event-2",
      eventTitle: "Culto da família",
      departmentId: "media",
      departmentName: "Mídia",
      roleName: "Projeção",
      requiredVolunteers: 1,
      startsAt: `${month}-27T21:00:00Z`,
      endsAt: `${month}-27T23:00:00Z`,
      checkinOpensAt: `${month}-27T20:00:00Z`,
      checkinClosesAt: `${month}-27T23:00:00Z`,
      instructions: "Conferir os slides.",
      unreadChatCount: 0,
      assignments: [assignment(2, "declined", "2")],
    },
  ];
  const positions = [
    {
      id: "position-1",
      departmentId: "reception",
      departmentName: "Recepção",
      roleId: "welcome",
      roleName: "Recepcionar",
      requiredVolunteers: 3,
      instructions: "Chegar 20 minutos antes.",
    },
  ];
  const manager: VolunteerDashboardData = {
    canAdminDelete: true,
    volunteers,
    departments,
    templates: [
      {
        id: "template-1",
        name: "Culto de domingo",
        description: "Recepção do culto",
        active: true,
        slots: positions,
      },
    ],
    schedules: [
      {
        id: "schedule-1",
        month: `${month}-01`,
        status: "draft",
        publishedAt: null,
        shifts,
      },
    ],
    eventPlans: ["event-1", "event-2", "event-existing"].map((id, index) => ({
      eventId: id,
      eventTitle: [
        "Culto de domingo",
        "Culto da família",
        "Encontro de líderes",
      ][index],
      startsAt: `${month}-${[20, 27, 29][index]}T21:00:00Z`,
      schedulePublishedAt: index === 1 ? `${month}-15T12:00:00Z` : null,
      setlistId: null,
      setlistTitle: "",
      setlistNotes: "",
      setlistItems: [],
      timeline: [
        {
          id: "moment-1",
          title: "Boas-vindas",
          plannedAt: `${month}-${[20, 27, 29][index]}T21:00:00Z`,
          actualStartedAt: null,
          durationMinutes: 5,
          responsibleProfileId: null,
          instructions: "Acolher os visitantes",
          sortOrder: 0,
        },
      ],
      positions: index === 2 ? [] : positions,
    })),
    programmings: [
      {
        id: "programming-1",
        title: "Culto de domingo",
        description: "",
        kind: "service",
        startsAt: `${month}-20T21:00:00Z`,
        durationMinutes: 120,
        location: "Templo principal",
        timezone: "America/Sao_Paulo",
        recurrenceFrequency: "weekly",
        recurrenceWeekdays: [0],
        recurrenceUntil: null,
        recurrenceNeedsReview: false,
        active: true,
        templateId: "template-1",
        positions,
        occurrences: [
          {
            eventId: "event-1",
            startsAt: `${month}-20T21:00:00Z`,
            endsAt: `${month}-20T23:00:00Z`,
            schedulePublishedAt: null,
            requiredVolunteers: 3,
            assignedVolunteers: 1,
            status: "incomplete",
          },
        ],
      },
    ],
    feedPosts: [
      {
        id: "post-1",
        title: "Encontro das equipes",
        content: "Domingo, às 17h40, vamos alinhar a recepção e orar juntos.",
        status: "published",
        audience: "all",
        departmentIds: [],
        publishedAt: `${month}-15T12:00:00Z`,
        createdAt: `${month}-15T12:00:00Z`,
      },
    ],
    swaps: [
      {
        id: "swap-1",
        assignmentId: "assignment-1-2",
        requestedByVolunteerId: volunteers[1].id,
        replacementVolunteerId: null,
        replacementName: null,
        status: "open",
        reason: "Preciso de um substituto neste domingo.",
        createdAt: `${month}-15T12:00:00Z`,
      },
    ],
    reports: {
      confirmationRate: 50,
      attendanceRate: 90,
      declineRate: 10,
      noShowRate: 0,
      overloadedVolunteers: 0,
      inactiveVolunteers: 0,
      openSwaps: 1,
      deliveryFailures: 0,
      departmentCoverage: [],
    },
    v2Enabled: true,
    settings: {
      v2Enabled: true,
      timezone: "America/Sao_Paulo",
      requireSwapApproval: true,
      reminderHours: [24, 2],
    },
    songs: [],
    metrics: {
      activeVolunteers: 4,
      assignedThisMonth: 3,
      openVacancies: 3,
      checkinsThisMonth: 2,
      monthlyGrowth: 1,
    },
  };
  const portal: VolunteerPortalData = {
    volunteer: volunteers[0],
    upcomingAssignments: [
      { ...shifts[1], assignments: [shifts[1].assignments[0]] },
    ],
    feedPosts: manager.feedPosts,
    availability: {
      rules: [],
      exceptions: [],
      preferences: [],
      desiredServicesPerMonth: 2,
      maxServicesPerMonth: 4,
      minimumRestHours: 12,
    },
    swaps: [],
    recognitions: [],
    notificationPreferences: {
      scheduleEnabled: true,
      reminderEnabled: true,
      swapEnabled: true,
      chatEnabled: true,
      feedEnabled: true,
      recognitionEnabled: true,
      pushEnabled: false,
      whatsappEnabled: true,
      emailEnabled: false,
    },
    eventPlans: manager.eventPlans.filter((item) => item.eventId === "event-2"),
  };
  return { manager, portal };
}
