import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AuthProvider } from "@/lib/auth/context";
import { requireSuperadmin } from "@/lib/auth/server";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperadmin();

  return (
    <AuthProvider initialUser={user}>
      <DashboardLayout initialEnabledModuleIds={null}>
        {children}
      </DashboardLayout>
    </AuthProvider>
  );
}
