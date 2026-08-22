'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logAuthEvent } from '@/lib/auth/log-auth-event'
import clsx from 'clsx'
import {
  LayoutDashboard, ShoppingBag, Package, Users, BarChart2,
  Settings, Store, LogOut, MessageSquare, ClipboardList,
  ScrollText, Boxes, PanelLeftClose, PanelLeftOpen, Menu, X, Ban
} from 'lucide-react'
import GrooviaMark from '@/components/ui/GrooviaMark'

const PENDING_ORDERS_POLL_MS = 30_000
const COLLAPSE_STORAGE_KEY = 'groovia_sidebar_collapsed'

interface SidebarProps {
  isSuperAdmin: boolean
  shopUser: {
    role: string
    full_name: string
    shops?: { name: string; logo_url: string | null } | null
  } | null
  userPhone: string
}

// Nav items per role — each carries its own accent color so the sidebar
// isn't a wall of uniform gray; the active state's brand highlight still
// wins visually since these only apply while inactive (see icon className).
const SUPER_ADMIN_NAV = [
  { href: '/dashboard',         label: 'Overview',       icon: LayoutDashboard, exact: true, color: '#3b82f6' },
  { href: '/dashboard/shops',   label: 'Shops',          icon: Store,           color: '#f59e0b' },
  { href: '/dashboard/catalog', label: 'Master Catalog', icon: Package,         color: '#a855f7' },
  { href: '/dashboard/restricted-items', label: 'Restricted Items', icon: Ban,  color: '#ef4444' },
  { href: '/dashboard/reports', label: 'Reports',        icon: BarChart2,       color: '#06b6d4' },
  { href: '/dashboard/logs',    label: 'Audit Logs',     icon: ScrollText,      color: '#14b8a6' },
  { href: '/dashboard/settings',label: 'Settings',       icon: Settings,        color: '#64748b' },
]

const OWNER_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true, color: '#3b82f6' },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag, color: '#f59e0b' },
  { href: '/dashboard/products', label: 'Products', icon: Package, color: '#a855f7' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, color: '#22c55e' },
  { href: '/dashboard/customers', label: 'Customers', icon: Users, color: '#ec4899' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare, color: '#14b8a6' },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart2, color: '#06b6d4' },
  { href: '/dashboard/staff', label: 'Staff', icon: ClipboardList, color: '#6366f1' },
  { href: '/dashboard/logs', label: 'Activity Logs', icon: ScrollText, color: '#eab308' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, color: '#64748b' },
]

const MANAGER_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true, color: '#3b82f6' },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag, color: '#f59e0b' },
  { href: '/dashboard/products', label: 'Products', icon: Package, color: '#a855f7' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, color: '#22c55e' },
  { href: '/dashboard/customers', label: 'Customers', icon: Users, color: '#ec4899' },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart2, color: '#06b6d4' },
  { href: '/dashboard/logs', label: 'Activity Logs', icon: ScrollText, color: '#eab308' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, color: '#64748b' },
]

const STAFF_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true, color: '#3b82f6' },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag, color: '#f59e0b' },
  { href: '/dashboard/products', label: 'Products', icon: Package, color: '#a855f7' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, color: '#22c55e' },
]

function getNav(isSuperAdmin: boolean, role: string) {
  if (isSuperAdmin) return SUPER_ADMIN_NAV
  if (role === 'owner') return OWNER_NAV
  if (role === 'manager') return MANAGER_NAV
  return STAFF_NAV
}

export default function Sidebar({ isSuperAdmin, shopUser, userPhone }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [pendingCount, setPendingCount] = useState(0)
  // Lazy-init from localStorage so a returning user's choice sticks across
  // full reloads, not just client-side nav (which would keep it anyway,
  // since this layout doesn't remount on route changes within /dashboard).
  // Desktop-only concept — the icon-rail space-saving mode doesn't apply
  // to the mobile drawer below, which is always shown full-width when open.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = getNav(isSuperAdmin, shopUser?.role ?? '')
  // For a super admin, shopUser is null (they're not a shop_users row) —
  // showing the email as both the bold name line AND the muted line below
  // it read as a doubled, identity-less footer. "Super Admin" as the bold
  // line (matching the same label already used in the nav header's role
  // pill) plus the email underneath mirrors the shop_user footer's shape
  // (name, then a secondary identifier) without needing a real name field
  // to exist anywhere for platform admins.
  const displayName = isSuperAdmin ? 'Super Admin' : shopUser?.full_name ?? userPhone
  const shopName = shopUser?.shops?.name ?? 'GrooVia Platform'
  const shopLogoUrl = shopUser?.shops?.logo_url ?? null
  const roleLabel = isSuperAdmin ? 'Super Admin' : shopUser?.role ?? ''

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  // Below md (768px) there's no room for a permanent 256px rail — the
  // sidebar becomes a slide-in drawer instead (see the fixed/translate
  // classes on <aside> below), opened via the floating menu button and
  // closed on backdrop tap, nav-link tap, or route change.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Polls the same cheap count-only endpoint OrderAlertListener uses, so the
  // "Orders" nav badge reflects the real pending count instead of the
  // hardcoded dot it used to show — updates on its own poll cycle, and also
  // gets an immediate nudge whenever OrderAlertListener detects a new order
  // (see the groovia:pending-orders-changed listener below).
  useEffect(() => {
    if (isSuperAdmin) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/shop/orders/pending-summary')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setPendingCount(data.count ?? 0)
      } catch {
        // Best-effort — next poll picks it up.
      }
    }

    poll()
    const interval = setInterval(poll, PENDING_ORDERS_POLL_MS)
    window.addEventListener('groovia:pending-orders-changed', poll)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('groovia:pending-orders-changed', poll)
    }
  }, [isSuperAdmin])

  async function handleSignOut() {
    // Logged before signOut() runs, not after — signOut() clears the
    // session cookie /api/auth/log-event needs to identify who's leaving.
    await logAuthEvent('logout')

    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(item: { href: string; exact?: boolean }) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <>
      {/* Mobile menu trigger — floating, only rendered while the drawer is
          closed; hidden entirely at md+ where the sidebar is static. */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-surface-card border border-surface-border shadow-sm text-ink"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Backdrop — mobile drawer only. */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'flex flex-col flex-shrink-0 bg-surface-card border-r border-surface-border transition-all duration-200',
          'fixed inset-y-0 left-0 z-40 md:static md:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-64 md:w-[68px]' : 'w-64'
        )}
      >
        {/* Logo + shop name */}
        <div className={clsx('border-b border-surface-border p-5', collapsed && 'md:p-3')}>
          <div className={clsx('flex items-center gap-3', collapsed && 'md:flex-col md:gap-2')}>
            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center overflow-hidden flex-shrink-0">
              {shopLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shopLogoUrl} alt={shopName} className="w-full h-full object-cover" />
              ) : (
                <GrooviaMark size={20} />
              )}
            </div>
            <div className={clsx('min-w-0 flex-1', collapsed && 'md:hidden')}>
              <p className="font-display font-semibold text-ink text-sm truncate">{shopName}</p>
              <p className="text-xs text-ink-muted capitalize">{roleLabel}</p>
            </div>
            {/* Mobile: closes the drawer. Desktop: collapses to icon rail. */}
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="md:hidden p-1.5 rounded-lg hover:bg-surface-hover text-ink-faint hover:text-ink transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={toggleCollapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:inline-flex p-1.5 rounded-lg hover:bg-surface-hover text-ink-faint hover:text-ink transition-colors flex-shrink-0"
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className={clsx('flex-1 min-h-0 py-4 px-3 overflow-y-auto space-y-0.5', collapsed && 'md:px-2')}>
          {navItems.map(item => {
            const Icon = item.icon
            const active = isActive(item)
            const showBadge = item.label === 'Orders' && pendingCount > 0
            return (
              <div key={item.href} className="relative group">
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    collapsed && 'md:justify-center md:px-0 md:gap-0',
                    active
                      ? 'bg-brand/15 text-brand-dark font-semibold'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                  )}
                  style={active ? { boxShadow: 'inset 0 1px 2px rgba(11,28,48,0.06), inset 0 0 0 1px rgba(0,104,95,0.08)' } : undefined}
                >
                  <span className="relative flex-shrink-0">
                    <Icon className="w-4 h-4" style={active ? undefined : { color: item.color }} />
                    {showBadge && (
                      <span className={clsx(
                        'absolute -top-1.5 -right-1.5 bg-brand text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] items-center justify-center leading-none px-0.5',
                        collapsed ? 'hidden md:flex' : 'hidden'
                      )}>
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                  <span className={clsx(collapsed && 'md:hidden')}>{item.label}</span>
                  {showBadge && (
                    <span className={clsx(
                      'ml-auto bg-brand text-white text-xs px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center',
                      collapsed && 'md:hidden'
                    )}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
                {/* Hover tooltip — desktop collapsed mode only, since that's
                    the only state where the label text itself is hidden. */}
                {collapsed && (
                  <div className="hidden md:block pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50">
                    {item.label}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User footer */}
        <div className={clsx('border-t border-surface-border p-3', collapsed && 'md:p-2')}>
          <div className={clsx('flex items-center gap-3 px-2 py-2 rounded-lg', collapsed && 'md:flex-col md:gap-2')}>
            <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center flex-shrink-0" title={collapsed ? displayName : undefined} aria-label={collapsed ? displayName : undefined}>
              <span className="text-xs font-semibold text-brand-dark">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className={clsx('min-w-0 flex-1', collapsed && 'md:hidden')}>
              <p className="text-sm font-medium text-ink truncate">{displayName}</p>
              <p className="text-xs text-ink-muted truncate">{userPhone}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 rounded-lg hover:bg-surface-hover text-ink-faint hover:text-ink transition-colors flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
