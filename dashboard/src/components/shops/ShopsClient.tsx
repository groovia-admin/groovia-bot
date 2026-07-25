'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format, isPast } from 'date-fns'
import {
  Search, Plus, Store, MapPin, Phone, Calendar,
  CheckCircle, XCircle, AlertTriangle, ChevronDown,
  MoreVertical, ToggleLeft, ToggleRight, ExternalLink,
  Filter
} from 'lucide-react'
import clsx from 'clsx'
import type { Shop } from '@/types/database'

type ShopRow = Pick<Shop,
  'id' | 'slug' | 'name' | 'city' | 'state' | 'is_active' |
  'subscription_status' | 'trial_ends_at' | 'owner_phone' | 'created_at' | 'updated_at'
>

const SUB_STATUS_CONFIG = {
  trial:      { label: 'Trial',     color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  active:     { label: 'Active',    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  past_due:   { label: 'Past Due',  color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  cancelled:  { label: 'Cancelled', color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
  expired:    { label: 'Expired',   color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  suspended:  { label: 'Suspended', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

interface AddShopForm {
  name: string
  slug: string
  owner_phone: string
  city: string
  state: string
}

export default function ShopsClient({ initialShops }: { initialShops: ShopRow[] }) {
  const supabase = createClient()

  const [shops, setShops] = useState<ShopRow[]>(initialShops)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterActive, setFilterActive] = useState<string>('all')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<AddShopForm>({ name: '', slug: '', owner_phone: '', city: '', state: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [toastMsg, setToastMsg] = useState('')

  function toast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    setAddForm(f => ({ ...f, name, slug }))
  }

  // Filtered + searched list
  const filtered = useMemo(() => {
    return shops.filter(s => {
      const matchSearch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.slug.toLowerCase().includes(search.toLowerCase()) ||
        s.owner_phone?.includes(search) ||
        s.city?.toLowerCase().includes(search.toLowerCase())

      const matchStatus = filterStatus === 'all' || s.subscription_status === filterStatus
      const matchActive = filterActive === 'all' ||
        (filterActive === 'active' && s.is_active) ||
        (filterActive === 'inactive' && !s.is_active)

      return matchSearch && matchStatus && matchActive
    })
  }, [shops, search, filterStatus, filterActive])

  // Stats
  const stats = useMemo(() => ({
    total: shops.length,
    active: shops.filter(s => s.is_active).length,
    trial: shops.filter(s => s.subscription_status === 'trial').length,
    revenue_active: shops.filter(s => s.subscription_status === 'active').length,
  }), [shops])

  async function toggleActive(shop: ShopRow) {
    const newVal = !shop.is_active
    const action = newVal ? 'activate' : 'suspend'
    if (!confirm(`${action === 'suspend' ? 'Suspend' : 'Activate'} "${shop.name}"?`)) return

    const { error } = await supabase
      .from('shops')
      .update({ is_active: newVal, updated_at: new Date().toISOString() })
      .eq('id', shop.id)

    if (error) {
      toast(`Error: ${error.message}`)
    } else {
      setShops(prev => prev.map(s => s.id === shop.id ? { ...s, is_active: newVal } : s))
      toast(`"${shop.name}" ${newVal ? 'activated' : 'suspended'}`)
    }
    setOpenMenu(null)
  }

  async function updateSubStatus(shop: ShopRow, status: string) {
    const { error } = await supabase
      .from('shops')
      .update({ subscription_status: status as Shop['subscription_status'], updated_at: new Date().toISOString() })
      .eq('id', shop.id)

    if (error) {
      toast(`Error: ${error.message}`)
    } else {
      setShops(prev => prev.map(s => s.id === shop.id ? { ...s, subscription_status: status as Shop['subscription_status'] } : s))
      toast(`Subscription updated to "${status}"`)
    }
    setOpenMenu(null)
  }

  async function handleAddShop(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')

    const { data, error } = await supabase
      .from('shops')
      .insert({
        name: addForm.name,
        slug: addForm.slug,
        owner_phone: addForm.owner_phone || null,
        city: addForm.city || null,
        state: addForm.state || null,
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) {
      setAddError(error.message.includes('unique') ? 'That slug is already taken' : error.message)
    } else if (data) {
      setShops(prev => [data as ShopRow, ...prev])
      setShowAddModal(false)
      setAddForm({ name: '', slug: '', owner_phone: '', city: '', state: '' })
      toast(`Shop "${data.name}" created`)
    }
    setAddLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Shops</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage all merchant accounts</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Shop
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total shops', value: stats.total, icon: Store, color: 'text-slate-300' },
          { label: 'Active', value: stats.active, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'On trial', value: stats.trial, icon: AlertTriangle, color: 'text-amber-400' },
          { label: 'Paid', value: stats.revenue_active, icon: CheckCircle, color: 'text-brand' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">{s.label}</p>
              <s.icon className={clsx('w-4 h-4', s.color)} />
            </div>
            <p className={clsx('text-2xl font-bold font-display', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, city..."
            className="input pl-9"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="input w-auto pr-8 cursor-pointer"
        >
          <option value="all">All subscriptions</option>
          {Object.entries(SUB_STATUS_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>

        <select
          value={filterActive}
          onChange={e => setFilterActive(e.target.value)}
          className="input w-auto pr-8 cursor-pointer"
        >
          <option value="all">Active & Inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Location</th>
                <th>Owner</th>
                <th>Subscription</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    {search || filterStatus !== 'all' || filterActive !== 'all'
                      ? 'No shops match your filters'
                      : 'No shops yet. Add the first one.'}
                  </td>
                </tr>
              ) : filtered.map(shop => {
                const subCfg = SUB_STATUS_CONFIG[shop.subscription_status] ?? SUB_STATUS_CONFIG.trial
                const trialExpired = shop.trial_ends_at && isPast(new Date(shop.trial_ends_at))

                return (
                  <tr key={shop.id}>
                    {/* Shop name + slug */}
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                          <Store className="w-4 h-4 text-brand" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-100">{shop.name}</p>
                          <p className="text-xs text-slate-500">/{shop.slug}</p>
                        </div>
                      </div>
                    </td>

                    {/* Location */}
                    <td>
                      {shop.city ? (
                        <span className="flex items-center gap-1 text-slate-400">
                          <MapPin className="w-3 h-3" />
                          {shop.city}{shop.state ? `, ${shop.state}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Owner */}
                    <td>
                      {shop.owner_phone ? (
                        <span className="flex items-center gap-1 text-slate-400 text-xs">
                          <Phone className="w-3 h-3" />
                          {shop.owner_phone}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Subscription */}
                    <td>
                      <span className={clsx(
                        'status-badge border',
                        subCfg.color
                      )}>
                        {subCfg.label}
                      </span>
                      {shop.subscription_status === 'trial' && shop.trial_ends_at && (
                        <p className={clsx('text-xs mt-0.5', trialExpired ? 'text-red-400' : 'text-slate-500')}>
                          {trialExpired ? 'Expired' : `Ends ${formatDistanceToNow(new Date(shop.trial_ends_at), { addSuffix: true })}`}
                        </p>
                      )}
                    </td>

                    {/* Active status */}
                    <td>
                      <span className={clsx(
                        'status-badge border',
                        shop.is_active
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          : 'text-red-400 bg-red-400/10 border-red-400/20'
                      )}>
                        {shop.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {shop.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* Joined */}
                    <td>
                      <span className="text-slate-400 text-xs">
                        {format(new Date(shop.created_at), 'dd MMM yyyy')}
                      </span>
                    </td>

                    {/* Actions menu */}
                    <td className="text-right pr-4">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setOpenMenu(openMenu === shop.id ? null : shop.id)}
                          className="btn-ghost p-1.5"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenu === shop.id && (
                          <>
                            {/* Backdrop */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenu(null)}
                            />
                            <div className="absolute right-0 top-8 z-20 w-52 bg-surface-card border border-surface-border rounded-xl shadow-xl py-1">
                              {/* Toggle active */}
                              <button
                                onClick={() => toggleActive(shop)}
                                className={clsx(
                                  'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-hover transition-colors',
                                  shop.is_active ? 'text-red-400' : 'text-emerald-400'
                                )}
                              >
                                {shop.is_active
                                  ? <><XCircle className="w-4 h-4" /> Suspend shop</>
                                  : <><CheckCircle className="w-4 h-4" /> Activate shop</>}
                              </button>

                              <div className="border-t border-surface-border my-1" />

                              {/* Subscription status changes */}
                              <p className="px-3.5 py-1.5 text-xs text-slate-500 font-medium">Set subscription</p>
                              {Object.entries(SUB_STATUS_CONFIG).map(([val, cfg]) => (
                                <button
                                  key={val}
                                  onClick={() => updateSubStatus(shop, val)}
                                  className={clsx(
                                    'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-hover transition-colors',
                                    shop.subscription_status === val ? 'text-brand' : 'text-slate-300'
                                  )}
                                >
                                  {shop.subscription_status === val && (
                                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                  )}
                                  <span className={shop.subscription_status === val ? 'ml-0' : 'ml-5'}>
                                    {cfg.label}
                                  </span>
                                </button>
                              ))}

                              <div className="border-t border-surface-border my-1" />

                              {/* View public site */}
                              <a
                                href={`https://groovia.co.in/shop/${shop.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-surface-hover transition-colors"
                                onClick={() => setOpenMenu(null)}
                              >
                                <ExternalLink className="w-4 h-4" />
                                View public page
                              </a>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-surface-border text-xs text-slate-500">
            Showing {filtered.length} of {shops.length} shops
          </div>
        )}
      </div>

      {/* Add Shop Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h2 className="font-display text-lg font-semibold text-white mb-1">Add New Shop</h2>
              <p className="text-slate-400 text-sm mb-6">Creates a 30-day trial account</p>

              <form onSubmit={handleAddShop} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Shop name *</label>
                  <input
                    value={addForm.name}
                    onChange={e => handleNameChange(e.target.value)}
                    placeholder="Sharma Kirana"
                    required
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Slug * <span className="text-slate-600 font-normal">(URL identifier)</span>
                  </label>
                  <div className="flex">
                    <span className="flex items-center px-3 rounded-l-lg bg-surface-hover border border-r-0 border-surface-border text-slate-500 text-xs whitespace-nowrap">
                      /shop/
                    </span>
                    <input
                      value={addForm.slug}
                      onChange={e => setAddForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      placeholder="sharma-kirana"
                      required
                      className="input rounded-l-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Owner phone</label>
                  <input
                    value={addForm.owner_phone}
                    onChange={e => setAddForm(f => ({ ...f, owner_phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">City</label>
                    <input
                      value={addForm.city}
                      onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="Ahmedabad"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">State</label>
                    <input
                      value={addForm.state}
                      onChange={e => setAddForm(f => ({ ...f, state: e.target.value }))}
                      placeholder="Gujarat"
                      className="input"
                    />
                  </div>
                </div>

                {addError && (
                  <p className="text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                    {addError}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setAddError('') }}
                    className="btn-secondary flex-1 justify-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="btn-primary flex-1 justify-center"
                  >
                    {addLoading ? 'Creating...' : 'Create Shop'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-card border border-surface-border rounded-xl px-4 py-3 shadow-xl text-sm text-slate-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {toastMsg}
        </div>
      )}
    </div>
  )
}
