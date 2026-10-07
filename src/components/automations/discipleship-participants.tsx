import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server";
import { hasPermission } from "@/lib/types";
import { getSql } from "@/lib/db/client";
import {
  enrollReadingParticipant,
  completeReadingParticipantStep,
} from "@/lib/automations/discipleship-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export async function DiscipleshipParticipants() {
  const user = await getCurrentUser();
  if (
    !user ||
    !hasPermission(user, "automations.tasks") ||
    !hasPermission(user, "content.edit")
  )
    return null;
  const company = requireUserCompanyId(user),
    sql = getSql();
  const [plans, people, enrollments, steps, progress] = await Promise.all([
    sql`select id,name from public.reading_plans where company_id=${company} and status='published' and deleted_at is null`,
    sql`select id,full_name from public.people where company_id=${company} and is_active and deleted_at is null order by full_name`,
    sql`select e.id,e.plan_id,e.status,p.full_name,r.name from public.reading_plan_enrollments e join public.people p on p.id=e.person_id and p.company_id=e.company_id join public.reading_plans r on r.id=e.plan_id and r.company_id=e.company_id where e.company_id=${company} order by e.created_at desc limit 100`,
    sql`select id,plan_id,title from public.reading_plan_steps where company_id=${company} and deleted_at is null order by day_number`,
    sql`select enrollment_id,step_id from public.reading_plan_person_progress where company_id=${company}`,
  ]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Participantes do discipulado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Inscrições e conclusão de etapas podem iniciar os fluxos publicados em
          Automações.
        </p>
        <form
          action={enrollReadingParticipant}
          className="flex flex-wrap gap-2"
        >
          <select
            aria-label="Plano para inscrição"
            name="planId"
            required
            className="min-w-0 rounded-md border bg-background p-2 text-sm"
          >
            <option value="">Escolha um plano publicado</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Participante do discipulado"
            name="personId"
            required
            className="min-w-0 rounded-md border bg-background p-2 text-sm"
          >
            <option value="">Escolha a pessoa</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={!plans.length}>
            Inscrever
          </Button>
        </form>
        {enrollments.map((e) => (
          <div key={e.id} className="rounded-lg border p-3">
            <p className="text-sm font-medium">
              {e.full_name} · {e.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.status === "completed" ? "Concluído" : "Em andamento"}
            </p>
            {e.status === "in_progress" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {steps
                  .filter(
                    (s) =>
                      s.plan_id === e.plan_id &&
                      !progress.some(
                        (p) => p.enrollment_id === e.id && p.step_id === s.id,
                      ),
                  )
                  .map((s) => (
                    <form key={s.id} action={completeReadingParticipantStep}>
                      <input name="enrollmentId" type="hidden" value={e.id} />
                      <input name="stepId" type="hidden" value={s.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Concluir: {s.title}
                      </Button>
                    </form>
                  ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
