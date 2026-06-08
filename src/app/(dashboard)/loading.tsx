export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border/50 p-4 lg:block">
        <div className="flex items-center gap-3 py-2">
          <div className="h-10 w-10 rounded-xl bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="h-3 w-36 rounded bg-muted" />
          </div>
        </div>
        <div className="mt-8 space-y-6">
          {Array.from({ length: 5 }).map((_, groupIndex) => (
            <div key={groupIndex} className="space-y-2">
              <div className="h-3 w-20 rounded bg-muted" />
              {Array.from({ length: 4 }).map((_, itemIndex) => (
                <div key={itemIndex} className="h-9 rounded-lg bg-muted/70" />
              ))}
            </div>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-3">
              <div className="h-7 w-52 rounded bg-muted" />
              <div className="h-4 w-72 rounded bg-muted/80" />
            </div>
            <div className="hidden h-9 w-32 rounded bg-muted sm:block" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-lg border border-border/40 bg-muted/40" />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-72 rounded-lg border border-border/40 bg-muted/40" />
            <div className="h-72 rounded-lg border border-border/40 bg-muted/40" />
          </div>
        </div>
      </main>
    </div>
  )
}
