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
  ScrollText, Bell, Boxes, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'

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
  { href: '/dashboard/logs',    label: 'Audit Logs',     icon: ScrollText,      color: '#06b6d4' },
  { href: '/dashboard/settings',label: 'Settings',       icon: Settings,        color: '#64748b' },
]

const OWNER_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true, color: '#3b82f6' },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag, color: '#f59e0b' },
  { href: '/dashboard/products', label: 'Products', icon: Package, color: '#a855f7' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, color: '#22c55e' },
  { href: '/dashboard/customers', label: 'Customers', icon: Users, color: '#ec4899' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare, color: '#14b8a6' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2, color: '#06b6d4' },
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
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2, color: '#06b6d4' },
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'
  })

  const navItems = getNav(isSuperAdmin, shopUser?.role ?? '')
  const displayName = shopUser?.full_name ?? userPhone
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
    <aside
      className={clsx(
        'flex-shrink-0 flex flex-col bg-surface-card border-r border-surface-border transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Logo + shop name */}
      <div className={clsx('border-b border-surface-border', collapsed ? 'p-3' : 'p-5')}>
        <div className={clsx('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-3')}>
          <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center overflow-hidden flex-shrink-0">
            {shopLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shopLogoUrl} alt={shopName} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-bold text-brand text-sm">G</span>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-ink text-sm truncate">{shopName}</p>
              <p className="text-xs text-ink-muted capitalize">{roleLabel}</p>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-ink-faint hover:text-ink transition-colors flex-shrink-0"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className={clsx('flex-1 min-h-0 py-4 overflow-y-auto space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map(item => {
          const Icon = item.icon
          const active = isActive(item)
          const showBadge = item.label === 'Orders' && pendingCount > 0
          return (
            <div key={item.href} className="relative group">
              <Link
                href={item.href}
                className={clsx(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                  active
                    ? 'bg-brand/15 text-brand-dark font-semibold'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                )}
              >
                <span className="relative flex-shrink-0">
                  <Icon className="w-4 h-4" style={active ? undefined : { color: item.color }} />
                  {collapsed && showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 bg-brand text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center leading-none px-0.5">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </span>
                {!collapsed && item.label}
                {!collapsed && showBadge && (
                  <span className="ml-auto bg-brand text-white text-xs px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
              {/* Hover tooltip — collapsed mode only, since the label text
                  itself is hidden then. */}
              {collapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50">
                  {item.label}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className={clsx('border-t border-surface-border', collapsed ? 'p-2' : 'p-3')}>
        <div className={clsx('flex items-center rounded-lg', collapsed ? 'flex-col gap-2 py-2' : 'gap-3 px-2 py-2')}>
          <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center flex-shrink-0" title={collapsed ? displayName : undefined}>
            <span className="text-xs font-semibold text-brand-dark">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink truncate">{displayName}</p>
              <p className="text-xs text-ink-muted truncate">{userPhone}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 rounded-lg hover:bg-surface-hover text-ink-faint hover:text-ink transition-colors flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
