import { AuthBackdrop } from "@/components/auth/auth-backdrop"
import { AuthProvider } from "@/lib/auth/context"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 py-10">
        <AuthBackdrop />
        {children}
      </div>
    </AuthProvider>
  )
}
