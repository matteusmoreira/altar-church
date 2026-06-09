import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { AUTH_USER_EMAIL_HEADER, AUTH_USER_ID_HEADER } from "@/lib/auth/proxy-headers"
import { protectedDashboardPrefixes } from "@/lib/navigation/routes"
import { getSupabasePublishableKey, getSupabaseUrl } from "./env"

function isProtectedPath(pathname: string) {
  return protectedDashboardPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

interface CookieToSet {
  name: string
  value: string
  options: CookieOptions
}

function applySessionUpdates(
  response: NextResponse,
  cookiesToSet: CookieToSet[],
  headersToSet: Record<string, string>
) {
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value))
  return response
}

export async function updateSession(request: NextRequest) {
  const cookiesToSet: CookieToSet[] = []
  let headersToSet: Record<string, string> = {}

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(nextCookiesToSet, nextHeadersToSet) {
        cookiesToSet.splice(0, cookiesToSet.length, ...nextCookiesToSet)
        headersToSet = nextHeadersToSet
        nextCookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(AUTH_USER_ID_HEADER)
  requestHeaders.delete(AUTH_USER_EMAIL_HEADER)

  if (user) {
    requestHeaders.set(AUTH_USER_ID_HEADER, user.id)
    if (user.email) {
      requestHeaders.set(AUTH_USER_EMAIL_HEADER, user.email)
    }
  }

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return applySessionUpdates(NextResponse.redirect(url), cookiesToSet, headersToSet)
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    url.search = ""
    return applySessionUpdates(NextResponse.redirect(url), cookiesToSet, headersToSet)
  }

  return applySessionUpdates(NextResponse.next({ request: { headers: requestHeaders } }), cookiesToSet, headersToSet)
}
