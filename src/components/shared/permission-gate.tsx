"use client"

import { useAuth } from "@/lib/auth/context"
import { hasPermission, type Permission } from "@/lib/types"

interface PermissionGateProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { user } = useAuth()
  if (!user) return fallback || null
  if (!hasPermission(user.role, permission)) return fallback || null
  return <>{children}</>
}
