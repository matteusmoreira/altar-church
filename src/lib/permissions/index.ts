import { useAuth } from "@/lib/auth/context"
import { hasPermission, type Permission } from "@/lib/types"

export function usePermission(permission: Permission) {
  const { user } = useAuth()
  if (!user) return false
  return hasPermission(user.role, permission)
}

export function useRequirePermission(permission: Permission) {
  const allowed = usePermission(permission)
  return allowed
}
