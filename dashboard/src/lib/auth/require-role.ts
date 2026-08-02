import { redirect } from 'next/navigation'
import { getViewerContext, type ViewerContext } from './viewer-context'
import type { ShopRole } from '@/types/database'

type AuthenticatedViewerContext = Exclude<ViewerContext, { kind: 'unauthenticated' }>

/**
 * Page/layout guard. Redirects unauthenticated viewers to /login, lets
 * super admins through unconditionally (they have their own separate nav
 * and pages), and redirects shop users whose role isn't in `allowed` back
 * to the dashboard overview.
 */
export async function requireRole(allowed: ShopRole[]): Promise<AuthenticatedViewerContext> {
  const context = await getViewerContext()

  if (context.kind === 'unauthenticated') {
    redirect('/login')
  }

  if (context.kind === 'super_admin') {
    return context
  }

  if (!allowed.includes(context.role)) {
    redirect('/dashboard')
  }

  return context
}

/**
 * Page/layout guard for platform-level (super-admin-only) pages, e.g.
 * the cross-shop shops list and master catalog. Shop users of any role
 * are redirected back to the dashboard overview.
 */
export async function requireSuperAdmin(): Promise<Extract<ViewerContext, { kind: 'super_admin' }>> {
  const context = await getViewerContext()

  if (context.kind === 'unauthenticated') {
    redirect('/login')
  }

  if (context.kind === 'shop_user') {
    redirect('/dashboard')
  }

  return context
}
