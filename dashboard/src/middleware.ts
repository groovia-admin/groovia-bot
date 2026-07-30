import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // CRITICAL: Must create the response first, then mutate it.
  // Never create a new NextResponse mid-function — it drops cookies.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: {
            name: string
            value: string
            options?: any
          }[]
        ) {
          // Write cookies onto the request first (for downstream middleware)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Re-create the response with updated request so cookies propagate
          supabaseResponse = NextResponse.next({ request })
          // Write onto the response (what the browser actually receives)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITICAL: getUser() MUST be called on every request.
  // This refreshes the session token if needed and sets the auth cookie.
  // Without this, server components get auth.uid() = null even with a valid session.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Public routes ──────────────────────────────────────────
  if (pathname.startsWith('/login') || pathname === '/') {
    if (user) {
      const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
      // Copy all cookies from supabaseResponse onto the redirect
      supabaseResponse.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
      })
      return redirectResponse
    }
    return supabaseResponse
  }

  // ── Protected routes ───────────────────────────────────────
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/admin')) {
    if (!user) {
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
      supabaseResponse.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
      })
      return redirectResponse
    }
  }

  // NOTE: Don't do DB queries in middleware (like checking platform_admins).
  // That check belongs in each page's server component where you have
  // the admin client available. Middleware should only handle session validity.

  return supabaseResponse
}

export const config = {
  matcher: [
    // Match everything except static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
