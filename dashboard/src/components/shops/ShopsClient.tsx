'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format, isPast } from 'date-fns'
import { Search, Plus, Store, MapPin, CheckCircle, XCircle, AlertTriangle, MoreVertical, ExternalLink, Calendar } from 'lucide-react'
import type { Shop, SubscriptionStatus } from '@/types/database'

type ShopRow = Pick<Shop, 'id' | 'slug' | 'name' | 'city' | 'state' | 'is_active' | 'subscription_status' | 'trial_ends_at' | 'created_at' | 'updated_at'>

const SUB: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
  trial:     { label: 'Trial',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  active:    { label: 'Active',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  past_due:  { label: 'Past Due',  color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  cancelled: { label: 'Cancelled', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  expired:   { label: 'Expired',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  suspended: { label: 'Suspended', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
}

interface AddForm { name: string; slug: string; city: string; state: string; address_line_1: string }

export default function ShopsClient({ initialShops }: { initialShops: ShopRow[] }) {
  const supabase = createClient()
  const [shops, setShops]           = useState<ShopRow[]>(initialShops)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState('all')
  const [openMenu, setOpenMenu]     = useState<string | null>(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [form, setForm]             = useState<AddForm>({ name: '', slug: '', city: '', state: '', address_line_1: '' })
  const [saving, setSaving]         = useState(false)
  const [addError, setAddError]     = useState('')
  const [toast, setToast]           = useState('')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function handleName(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    setForm(f => ({ ...f, name, slug }))
  }

  const filtered = useMemo(() => shops.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !search || s.name.toLowerCase().includes(q) || s.slug.includes(q) || s.city?.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'all' || s.subscription_status === filterStatus
    return matchSearch && matchStatus
  }), [shops, search, filterStatus])

  const stats = useMemo(() => ({
    total:   shops.length,
    active:  shops.filter(s => s.is_active).length,
    trial:   shops.filter(s => s.subscription_status === 'trial').length,
    paying:  shops.filter(s => s.subscription_status === 'active').length,
  }), [shops])

  async function toggleActive(shop: ShopRow) {
    const next = !shop.is_active
    if (!confirm(`${next ? 'Activate' : 'Suspend'} "${shop.name}"?`)) return
    const { error } = await supabase.from('shops').update({ is_active: next, updated_at: new Date().toISOString() }).eq('id', shop.id)
    if (error) { showToast(`Error: ${error.message}`); return }
    setShops(p => p.map(s => s.id === shop.id ? { ...s, is_active: next } : s))
    showToast(`"${shop.name}" ${next ? 'activated' : 'suspended'}`)
    setOpenMenu(null)
  }

  async function updateSub(shop: ShopRow, status: SubscriptionStatus) {
    const { error } = await supabase.from('shops').update({ subscription_status: status, updated_at: new Date().toISOString() }).eq('id', shop.id)
    if (error) { showToast(`Error: ${error.message}`); return }
    setShops(p => p.map(s => s.id === shop.id ? { ...s, subscription_status: status } : s))
    showToast('Subscription updated')
    setOpenMenu(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setAddError('')
    const { data, error } = await supabase.from('shops').insert({
      name: form.name, slug: form.slug,
      city: form.city || null, state: form.state || null,
      address_line_1: form.address_line_1 || null,
      subscription_status: 'trial' as SubscriptionStatus,
      trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    }).select('id,slug,name,city,state,is_active,subscription_status,trial_ends_at,created_at,updated_at').single()
    if (error) { setAddError(error.message.includes('unique') ? 'Slug already taken' : error.message) }
    else if (data) {
      setShops(p => [data as ShopRow, ...p])
      setShowAdd(false)
      setForm({ name: '', slug: '', city: '', state: '', address_line_1: '' })
      showToast(`Shop "${data.name}" created`)
    }
    setSaving(false)
  }

  // Shared inline styles
  const S = {
    card:   { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20 } as React.CSSProperties,
    badge:  (color: string, bg: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${color}33` } as React.CSSProperties),
    btn:    (bg: string, color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: bg, color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties),
    input:  { width: '100%', padding: '9px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 13, outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
    label:  { display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 } as React.CSSProperties,
    th:     { textAlign: 'left' as const, padding: '10px 16px', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.7px', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155' },
    td:     { padding: '12px 16px', fontSize: 13, color: '#94a3b8', borderBottom: '1px solid rgba(30,41,59,0.8)' } as React.CSSProperties,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>Shops</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Manage all merchant accounts</p>
        </div>
        <button style={S.btn('#3b82f6', '#fff')} onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Shop
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Shops', value: stats.total,  icon: <Store size={16} color="#94a3b8" />,       color: '#f1f5f9' },
          { label: 'Active',      value: stats.active, icon: <CheckCircle size={16} color="#22c55e" />, color: '#22c55e' },
          { label: 'On Trial',    value: stats.trial,  icon: <AlertTriangle size={16} color="#f59e0b" />,color: '#f59e0b' },
          { label: 'Paying',      value: stats.paying, icon: <CheckCircle size={16} color="#3b82f6" />, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</span>
              {s.icon}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input style={{ ...S.input, paddingLeft: 36 }} placeholder="Search shops..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.input, width: 180 }} value={filterStatus} onChange={e => setFilter(e.target.value)}>
          <option value="all">All subscriptions</option>
          {Object.entries(SUB).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Shop', 'Location', 'Subscription', 'Trial Ends', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', padding: 48, color: '#64748b' }}>
                  {search || filterStatus !== 'all' ? 'No shops match filters.' : 'No shops yet — add the first one.'}
                </td></tr>
              ) : filtered.map(shop => {
                const sub = SUB[shop.subscription_status] ?? SUB.trial
                const trialExpired = shop.trial_ends_at ? isPast(new Date(shop.trial_ends_at)) : false
                return (
                  <tr key={shop.id} style={{ transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,65,85,0.4)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Store size={14} color="#3b82f6" />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 13 }}>{shop.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>/{shop.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td style={S.td}>
                      {shop.city
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} />{shop.city}{shop.state ? `, ${shop.state}` : ''}</span>
                        : <span style={{ color: '#475569' }}>—</span>}
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(sub.color, sub.bg)}>{sub.label}</span>
                    </td>
                    <td style={S.td}>
                      {shop.subscription_status === 'trial' && shop.trial_ends_at
                        ? <span style={{ fontSize: 12, color: trialExpired ? '#ef4444' : '#94a3b8' }}>
                            {trialExpired ? 'Expired' : formatDistanceToNow(new Date(shop.trial_ends_at), { addSuffix: true })}
                          </span>
                        : <span style={{ color: '#475569' }}>—</span>}
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(shop.is_active ? '#22c55e' : '#ef4444', shop.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)')}>
                        {shop.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {shop.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <Calendar size={12} />{format(new Date(shop.created_at), 'dd MMM yyyy')}
                      </span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', paddingRight: 16 }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px 6px', borderRadius: 6 }}
                          onClick={() => setOpenMenu(openMenu === shop.id ? null : shop.id)}>
                          <MoreVertical size={16} />
                        </button>
                        {openMenu === shop.id && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpenMenu(null)} />
                            <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 20, width: 200, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: '4px 0' }}>
                              <button onClick={() => toggleActive(shop)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: shop.is_active ? '#ef4444' : '#22c55e', fontSize: 13, fontFamily: 'inherit' }}>
                                {shop.is_active ? <><XCircle size={14} /> Suspend</> : <><CheckCircle size={14} /> Activate</>}
                              </button>
                              <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
                              <div style={{ padding: '4px 14px 4px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Subscription</div>
                              {(Object.entries(SUB) as [SubscriptionStatus, typeof SUB[SubscriptionStatus]][]).map(([v, c]) => (
                                <button key={v} onClick={() => updateSub(shop, v)}
                                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', color: shop.subscription_status === v ? '#3b82f6' : '#cbd5e1', fontSize: 13, fontFamily: 'inherit' }}>
                                  {shop.subscription_status === v && <CheckCircle size={12} />}
                                  <span style={{ marginLeft: shop.subscription_status === v ? 0 : 20 }}>{c.label}</span>
                                </button>
                              ))}
                              <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
                              <a href={`https://groovia.co.in/shop/${shop.slug}`} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', color: '#cbd5e1', fontSize: 13, textDecoration: 'none' }}
                                onClick={() => setOpenMenu(null)}>
                                <ExternalLink size={14} /> View public page
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
          <div style={{ padding: '10px 16px', borderTop: '1px solid #334155', fontSize: 12, color: '#64748b' }}>
            Showing {filtered.length} of {shops.length} shops
          </div>
        )}
      </div>

      {/* Add Shop Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowAdd(false)} />
          <div style={{ position: 'relative', background: '#1e293b', border: '1px solid #334155', borderRadius: 16, width: '100%', maxWidth: 440, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Add New Shop</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>Creates a 60-day trial account</p>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Shop name *</label>
                <input style={S.input} value={form.name} onChange={e => handleName(e.target.value)} placeholder="Sharma Kirana" required />
              </div>
              <div>
                <label style={S.label}>Slug * <span style={{ color: '#475569', fontWeight: 400 }}>(URL: /shop/...)</span></label>
                <input style={S.input} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="sharma-kirana" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={S.label}>City</label>
                  <input style={S.input} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Ahmedabad" />
                </div>
                <div>
                  <label style={S.label}>State</label>
                  <input style={S.input} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="Gujarat" />
                </div>
              </div>
              <div>
                <label style={S.label}>Address</label>
                <input style={S.input} value={form.address_line_1} onChange={e => setForm(f => ({ ...f, address_line_1: e.target.value }))} placeholder="Shop #12, Main Road" />
              </div>
              {addError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', color: '#f87171', fontSize: 12 }}>{addError}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowAdd(false)} style={{ ...S.btn('#334155', '#94a3b8'), flex: 1, justifyContent: 'center' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ ...S.btn('#3b82f6', '#fff'), flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 20px', fontSize: 13, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <CheckCircle size={14} color="#22c55e" /> {toast}
        </div>
      )}
    </div>
  )
}