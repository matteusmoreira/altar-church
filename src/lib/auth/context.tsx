"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { User, UserRole } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  isAuthenticated: boolean
  isLoading: boolean
  hasRole: (roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function readCurrentUser() {
  const response = await fetch("/api/auth/me", { cache: "no-store" })
  if (!response.ok) return null
  const payload = (await response.json()) as { user: User | null }
  return payload.user
}

export function AuthProvider({ children, initialUser }: { children: React.ReactNode; initialUser?: User | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [isLoading, setIsLoading] = useState(initialUser === undefined)

  useEffect(() => {
    let active = true

    async function loadInitialUser() {
      try {
        const currentUser = await readCurrentUser()
        if (!active) return
        setUser(currentUser)
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    if (initialUser === undefined) void loadInitialUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return

      queueMicrotask(() => {
        if (!active) return

        if (event === "SIGNED_OUT") {
          setUser(null)
          return
        }

        void readCurrentUser()
          .then((currentUser) => {
            if (active) setUser(currentUser)
          })
          .catch(() => {
            if (active) setUser(null)
          })
      })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [initialUser, supabase])

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return false

      const profile = await readCurrentUser()
      if (!profile) {
        await supabase.auth.signOut()
        setUser(null)
        return false
      }

      setUser(profile)
      return true
    },
    [supabase]
  )

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = "/login"
  }, [supabase])

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      if (!user) return false
      return roles.includes(user.role)
    },
    [user]
  )

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isLoading, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
