import { PageHeader } from "@/components/shared"
import { requirePermission } from "@/lib/auth/permissions"
import { requireUser } from "@/lib/auth/server"
import { listEventForms, listEventMinistries } from "@/lib/operational/data"
import { listVolunteerTemplatesForEvents } from "@/lib/volunteers/data"
import { EventCreateForm } from "../event-create-form"

export default async function NewEventPage() {
  const user = await requireUser()
  await requirePermission("events.create", user.churchId)
  const [ministries, forms, volunteerTemplates] = await Promise.all([listEventMinistries(), listEventForms(), listVolunteerTemplatesForEvents()])
  return <div className="space-y-6"><PageHeader title="Novo evento" description="Prepare as informações, revise e salve seu rascunho." back={{ href: "/eventos", label: "Eventos" }} /><EventCreateForm canCreate ministries={ministries} forms={forms} volunteerTemplates={volunteerTemplates} /></div>
}
