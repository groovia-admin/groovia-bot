'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format, isPast } from 'date-fns'
import {
  Search, Plus, Store, MapPin, Calendar,
  CheckCircle, XCircle, AlertTriangle,
  MoreVertical, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import type { Shop, SubscriptionStatus } from '@/types/database'

// Only columns that exist in the actual DB
type ShopRow = Pick<Shop,
  'id' | 'slug' | 'name' | 'city' | 'state' | 'is_active' |
  'subscription_status' | 'trial_ends_at' | 'created_at' | 'updated_at'
>

const SUB_STATUS_CONFIG: Record<SubscriptionStatus, { label: string; color: string }> = {
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
  city: string
  state: string
  address_line_1: string
  description: string
}

export default function ShopsClient({ initialShops }: { initialShops: ShopRow[] }) {
  const supabase = createClient()

  const [shops, setShops]               = useState<ShopRow[]>(initialShops)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterActive, setFilterActive] = useState<string>('all')
  const [openMenu, setOpenMenu]         = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm]           = useState<AddShopForm>({
    name: '', slug: '', city: '', state: '', address_line_1: '', description: ''
  })
  const [addLoading, setAddLoading]     = useState(false)
  const [addError, setAddError]         = useState('')
  const [toastMsg, setToastMsg]         = useState('')

  function toast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    setAddForm(f => ({ ...f, name, slug }))
  }

  const filtered = useMemo(() => {
    return shops.filter(s => {
      const matchSearch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.slug.toLowerCase().includes(search.toLowerCase()) ||
        s.city?.toLowerCase().includes(search.toLowerCase())

      const matchStatus = filterStatus === 'all' || s.subscription_status === filterStatus
      const matchActive = filterActive === 'all' ||
        (filterActive === 'active' && s.is_active) ||
        (filterActive === 'inactive' && !s.is_active)

      return matchSearch && matchStatus && matchActive
    })
  }, [shops, search, filterStatus, filterActive])

  const stats = useMemo(() => ({
    total:          shops.length,
    active:         shops.filter(s => s.is_active).length,
    trial:          shops.filter(s => s.subscription_status === 'trial').length,
    revenue_active: shops.filter(s => s.subscription_status === 'active').length,
  }), [shops])

  async function toggleActive(shop: ShopRow) {
    const newVal = !shop.is_active
    if (!confirm(`${newVal ? 'Activate' : 'Suspend'} "${shop.name}"?`)) return

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

  async function updateSubStatus(shop: ShopRow, status: SubscriptionStatus) {
    const { error } = await supabase
      .from('shops')
      .update({ subscription_status: status, updated_at: new Date().toISOString() })
      .eq('id', shop.id)

    if (error) {
      toast(`Error: ${error.message}`)
    } else {
      setShops(prev => prev.map(s => s.id === shop.id ? { ...s, subscription_status: status } : s))
      toast(`Subscription updated to "${status}"`)
    }
    setOpenMenu(null)
  }

  async function handleAddShop(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')

    // Insert only columns that exist in the shops table
    const { data, error } = await supabase
      .from('shops')
      .insert({
        name:                addForm.name,
        slug:                addForm.slug,
        city:                addForm.city    || null,
        state:               addForm.state   || null,
        address_line_1:      addForm.address_line_1 || null,
        description:         addForm.description    || null,
        subscription_status: 'trial' as SubscriptionStatus,
        trial_ends_at:       new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
        is_active:           true,
      })
      .select('id, slug, name, city, state, is_active, subscription_status, trial_ends_at, created_at, updated_at')
      .single()

    if (error) {
      setAddError(
        error.message.includes('unique') || error.message.includes('duplicate')
          ? 'That slug is already taken — try a different one'
          : error.message
      )
    } else if (data) {
      setShops(prev => [data as ShopRow, ...prev])
      setShowAddModal(false)
      setAddForm({ name: '', slug: '', city: '', state: '', address_line_1: '', description: '' })
      toast(`Shop "${data.name}" created successfully`)
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total shops',  value: stats.total,          icon: Store,         color: 'text-slate-300' },
          { label: 'Active',       value: stats.active,         icon: CheckCircle,   color: 'text-emerald-400' },
          { label: 'On trial',     value: stats.trial,          icon: AlertTriangle, color: 'text-amber-400' },
          { label: 'Paid',         value: stats.revenue_active, icon: CheckCircle,   color: 'text-blue-400' },
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
            placeholder="Search by name, city, slug..."
            className="input pl-9"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-auto cursor-pointer">
          <option value="all">All subscriptions</option>
          {Object.entries(SUB_STATUS_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="input w-auto cursor-pointer">
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
                <th>Subscription</th>
                <th>Trial ends</th>
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
                      ? 'No shops match your filters.'
                      : 'No shops yet. Add the first one.'}
                  </td>
                </tr>
              ) : filtered.map(shop => {
                const subCfg = SUB_STATUS_CONFIG[shop.subscription_status] ?? SUB_STATUS_CONFIG.trial
                const trialExpired = shop.trial_ends_at ? isPast(new Date(shop.trial_ends_at)) : false

                return (
                  <tr key={shop.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Store className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-100">{shop.name}</p>
                          <p className="text-xs text-slate-500">/{shop.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {shop.city ? (
                        <span className="flex items-center gap-1 text-slate-400 text-sm">
                          <MapPin className="w-3 h-3" />
                          {shop.city}{shop.state ? `, ${shop.state}` : ''}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td>
                      <span className={clsx('status-badge border', subCfg.color)}>
                        {subCfg.label}
                      </span>
                    </td>
                    <td>
                      {shop.subscription_status === 'trial' && shop.trial_ends_at ? (
                        <span className={clsx('text-xs', trialExpired ? 'text-red-400' : 'text-slate-500')}>
                          {trialExpired
                            ? 'Expired'
                            : formatDistanceToNow(new Date(shop.trial_ends_at), { addSuffix: true })}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td>
                      <span className={clsx('status-badge border',
                        shop.is_active
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          : 'text-red-400 bg-red-400/10 border-red-400/20'
                      )}>
                        {shop.is_active
                          ? <><CheckCircle className="w-3 h-3" /> Active</>
                          : <><XCircle className="w-3 h-3" /> Suspended</>}
                      </span>
                    </td>
                    <td>
                      <span className="text-slate-400 text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(shop.created_at), 'dd MMM yyyy')}
                      </span>
                    </td>
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
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                            <div className="absolute right-0 top-8 z-20 w-52 rounded-xl shadow-xl py-1"
                              style={{ background: '#1e293b', border: '1px solid #334155' }}>
                              <button
                                onClick={() => toggleActive(shop)}
                                className={clsx('w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-slate-700/50',
                                  shop.is_active ? 'text-red-400' : 'text-emerald-400')}
                              >
                                {shop.is_active
                                  ? <><XCircle className="w-4 h-4" /> Suspend shop</>
                                  : <><CheckCircle className="w-4 h-4" /> Activate shop</>}
                              </button>
                              <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
                              <p className="px-3.5 py-1.5 text-xs text-slate-500 font-medium">Set subscription</p>
                              {(Object.entries(SUB_STATUS_CONFIG) as [SubscriptionStatus, { label: string; color: string }][]).map(([val, cfg]) => (
                                <button
                                  key={val}
                                  onClick={() => updateSubStatus(shop, val)}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50"
                                >
                                  {shop.subscription_status === val && <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                                  <span className={shop.subscription_status === val ? '' : 'ml-5'}>{cfg.label}</span>
                                </button>
                              ))}
                              <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
                              <a
                                href={`https://groovia.co.in/shop/${shop.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50"
                                onClick={() => setOpenMenu(null)}
                              >
                                <ExternalLink className="w-4 h-4" /> View public page
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
          <div className="px-4 py-3 text-xs text-slate-500" style={{ borderTop: '1px solid #334155' }}>
            Showing {filtered.length} of {shops.length} shops
          </div>
        )}
      </div>

      {/* Add Shop Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative rounded-2xl w-full max-w-md shadow-2xl"
            style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <div className="p-6">
              <h2 className="font-display text-lg font-semibold text-white mb-1">Add New Shop</h2>
              <p className="text-slate-400 text-sm mb-6">Creates a 60-day trial account</p>
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
                    <span className="flex items-center px-3 rounded-l-lg text-slate-500 text-xs whitespace-nowrap"
                      style={{ background: '#334155', border: '1px solid #475569', borderRight: 'none' }}>
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
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Address</label>
                  <input
                    value={addForm.address_line_1}
                    onChange={e => setAddForm(f => ({ ...f, address_line_1: e.target.value }))}
                    placeholder="Shop #12, Main Road"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                  <input
                    value={addForm.description}
                    onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Neighbourhood grocery store"
                    className="input"
                  />
                </div>
                {addError && (
                  <p className="text-red-400 text-xs px-3 py-2 rounded-lg" style={{ background: '#ef444420', border: '1px solid #ef444430' }}>
                    {addError}
                  </p>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddModal(false); setAddError('') }} className="btn-secondary flex-1 justify-center">
                    Cancel
                  </button>
                  <button type="submit" disabled={addLoading} className="btn-primary flex-1 justify-center">
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
        <div className="fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-xl text-sm text-slate-200 flex items-center gap-2"
          style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {toastMsg}
        </div>
      )}
    </div>
  )
}