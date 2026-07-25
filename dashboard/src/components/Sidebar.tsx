'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import clsx from 'clsx'
import {
  LayoutDashboard, ShoppingBag, Package, Users, BarChart2,
  Settings, Store, LogOut, MessageSquare, ClipboardList,
  ScrollText, ChevronDown, Bell, Boxes
} from 'lucide-react'

interface SidebarProps {
  isSuperAdmin: boolean
  shopUser: {
    role: string
    full_name: string
    shops?: { name: string; logo_url: string | null }
  } | null
  userPhone: string
}

// Nav items per role
const SUPER_ADMIN_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/shops', label: 'Shops', icon: Store },
  { href: '/dashboard/logs', label: 'Audit Logs', icon: ScrollText },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

const OWNER_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/dashboard/products', label: 'Products', icon: Package },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/dashboard/staff', label: 'Staff', icon: ClipboardList },
  { href: '/dashboard/logs', label: 'Activity Logs', icon: ScrollText },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

const MANAGER_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/dashboard/products', label: 'Products', icon: Package },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/dashboard/logs', label: 'Activity Logs', icon: ScrollText },
]

const STAFF_NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag },
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

  const navItems = getNav(isSuperAdmin, shopUser?.role ?? '')
  const displayName = shopUser?.full_name ?? userPhone
  const shopName = shopUser?.shops?.name ?? 'GrooVia Platform'
  const roleLabel = isSuperAdmin ? 'Super Admin' : shopUser?.role ?? ''

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(item: { href: string; exact?: boolean }) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-surface-card border-r border-surface-border">
      {/* Logo + shop name */}
      <div className="p-5 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
            <span className="font-display font-bold text-brand text-sm">G</span>
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-white text-sm truncate">{shopName}</p>
            <p className="text-xs text-slate-500 capitalize">{roleLabel}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-0.5">
        {navItems.map(item => {
          const Icon = item.icon
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                active
                  ? 'bg-brand/15 text-brand'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover'
              )}
            >
              <Icon className={clsx('w-4 h-4 flex-shrink-0', active ? 'text-brand' : 'text-slate-500 group-hover:text-slate-300')} />
              {item.label}
              {item.label === 'Orders' && (
                <span className="ml-auto bg-brand text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                  •
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-surface-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-slate-300">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200 truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{userPhone}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 rounded-lg hover:bg-surface-hover text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
