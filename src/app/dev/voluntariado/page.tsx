import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VolunteerHubClient } from "@/app/(dashboard)/voluntariado/volunteer-hub-client";
import { volunteerPreviewData } from "@/lib/volunteers/preview-data";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Prévia do voluntariado",
  robots: { index: false, follow: false },
};

export default async function VolunteerPreview({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; empty?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const data = volunteerPreviewData();
  if (query.empty === "1") {
    data.manager.volunteers = [];
    data.manager.departments = [];
    data.manager.schedules = [];
    data.manager.programmings = [];
    data.manager.eventPlans = [];
    data.manager.templates = [];
    data.manager.swaps = [];
    data.portal.upcomingAssignments = [];
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <aside className="rounded-xl border bg-muted p-4 text-sm space-y-2">
        <p className="font-semibold">
          Prévia local · dados fictícios · alterações e envios desabilitados
        </p>
        <nav className="flex flex-wrap gap-4" aria-label="Cenários da prévia">
          <Link
            className="underline"
            href="/dev/voluntariado?mode=manager&month=2026-09"
          >
            Visão do gestor
          </Link>
          <Link className="underline" href="/dev/voluntariado?mode=volunteer">
            Visão do voluntário
          </Link>
          <Link
            className="underline"
            href="/dev/voluntariado?mode=manager&empty=1&month=2026-09"
          >
            Primeiro acesso
          </Link>
        </nav>
      </aside>
      <Suspense fallback={<p>Carregando prévia…</p>}>
        {query.mode === "volunteer" ? (
          <VolunteerHubClient mode="volunteer" data={data.portal} />
        ) : (
          <VolunteerHubClient mode="manager" data={data.manager} />
        )}
      </Suspense>
    </main>
  );
}
