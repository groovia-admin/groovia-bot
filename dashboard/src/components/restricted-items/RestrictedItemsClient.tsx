'use client'

import { useMemo, useState } from 'react'
import { Trash2, Plus, Search, Pencil, Check, X, ListPlus } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'

type Term = { id: string; term: string; created_at: string }

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid var(--surface-border)',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 2px rgba(11,28,48,0.04)',
}
const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--surface-border)',
  background: '#F7F8FA',
  color: 'var(--ink)',
  fontSize: 'var(--text-md)',
  fontFamily: 'inherit',
  outline: 'none',
}
const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  color: 'var(--ink-faint)',
  cursor: 'pointer',
  padding: 6,
}

export default function RestrictedItemsClient({ initialTerms }: { initialTerms: Term[] }) {
  const toast = useToast()
  const [terms, setTerms] = useState<Term[]>(initialTerms)
  const [newTerm, setNewTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkAdding, setBulkAdding] = useState(false)

  const filteredTerms = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return terms
    return terms.filter((t) => t.term.toLowerCase().includes(q))
  }, [terms, search])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const term = newTerm.trim()
    if (!term) return

    setAdding(true)
    try {
      const response = await fetch('/api/admin/restricted-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term }),
      })
      const data = await response.json()

      if (!response.ok) {
        toast(data.error || 'Failed to add term', 'error')
        return
      }

      setTerms((prev) => [data.term, ...prev])
      setNewTerm('')
      toast(`"${term}" added to the restricted list`)
    } catch {
      toast('Failed to add term', 'error')
    } finally {
      setAdding(false)
    }
  }

  // One POST per line, sequential rather than Promise.all — clean,
  // readable per-line results (which succeeded/failed and why, e.g. a
  // duplicate) matter more here than speed for a list this size.
  async function handleBulkAdd() {
    const lines = Array.from(new Set(bulkText.split('\n').map((l) => l.trim()).filter(Boolean)))
    if (lines.length === 0) return

    setBulkAdding(true)
    let added = 0
    const failures: string[] = []

    for (const term of lines) {
      try {
        const response = await fetch('/api/admin/restricted-terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term }),
        })
        const data = await response.json()
        if (!response.ok) {
          failures.push(`${term} (${data.error || 'failed'})`)
          continue
        }
        setTerms((prev) => [data.term, ...prev])
        added++
      } catch {
        failures.push(`${term} (network error)`)
      }
    }

    setBulkAdding(false)
    setBulkText('')
    if (failures.length === 0) {
      setShowBulkAdd(false)
      toast(`${added} term${added === 1 ? '' : 's'} added`)
    } else {
      toast(`${added} added, ${failures.length} failed: ${failures.join(', ')}`, 'error')
    }
  }

  function startEdit(term: Term) {
    setEditingId(term.id)
    setEditingValue(term.term)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingValue('')
  }

  async function handleSaveEdit(term: Term) {
    const value = editingValue.trim()
    if (!value || value === term.term) {
      cancelEdit()
      return
    }

    setSavingEdit(true)
    try {
      const response = await fetch(`/api/admin/restricted-terms/${term.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: value }),
      })
      const data = await response.json()

      if (!response.ok) {
        toast(data.error || 'Failed to update term', 'error')
        return
      }

      setTerms((prev) => prev.map((t) => (t.id === term.id ? data.term : t)))
      toast(`Updated to "${value}"`)
      cancelEdit()
    } catch {
      toast('Failed to update term', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleRemove(term: Term) {
    if (!window.confirm(`Remove "${term.term}" from the restricted list? Shops will be able to add matching products again.`)) return

    setRemovingId(term.id)
    try {
      const response = await fetch(`/api/admin/restricted-terms/${term.id}`, { method: 'DELETE' })
      const data = await response.json()

      if (!response.ok) {
        toast(data.error || 'Failed to remove term', 'error')
        return
      }

      setTerms((prev) => prev.filter((t) => t.id !== term.id))
      toast(`"${term.term}" removed`)
    } catch {
      toast('Failed to remove term', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div style={{ ...cardStyle, maxWidth: 560 }}>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          style={inputStyle}
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          placeholder="e.g. tobacco, cigarette, alcohol"
          disabled={adding}
        />
        <button
          type="submit"
          disabled={adding || !newTerm.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--brand)',
            color: '#fff',
            fontSize: 'var(--text-md)',
            fontWeight: 600,
            cursor: adding || !newTerm.trim() ? 'not-allowed' : 'pointer',
            opacity: adding || !newTerm.trim() ? 0.6 : 1,
          }}
        >
          <Plus size={16} /> Add
        </button>
      </form>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="relative" style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
          <input
            style={{ ...inputStyle, paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terms…"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowBulkAdd((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--surface-border)', background: 'var(--surface)', color: 'var(--ink)',
            fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <ListPlus size={15} /> Bulk add
        </button>
      </div>

      {showBulkAdd && (
        <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--surface-border)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', margin: '0 0 8px' }}>One term per line.</p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'tobacco\ncigarette\nalcohol'}
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical', width: '100%' }}
            disabled={bulkAdding}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={handleBulkAdd}
              disabled={bulkAdding || !bulkText.trim()}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff',
                fontSize: 'var(--text-sm)', fontWeight: 600, cursor: bulkAdding || !bulkText.trim() ? 'not-allowed' : 'pointer',
                opacity: bulkAdding || !bulkText.trim() ? 0.6 : 1,
              }}
            >
              {bulkAdding ? 'Adding…' : 'Add all'}
            </button>
            <button
              type="button"
              onClick={() => { setShowBulkAdd(false); setBulkText('') }}
              disabled={bulkAdding}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--surface-border)', background: '#fff', color: 'var(--ink-muted)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {terms.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', textAlign: 'center', padding: '20px 0' }}>
          No restricted terms yet — every shop can add any product name.
        </p>
      ) : filteredTerms.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', textAlign: 'center', padding: '20px 0' }}>
          No terms match &quot;{search}&quot;.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredTerms.map((term) => (
            <div
              key={term.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 4px',
                borderBottom: '1px solid var(--surface-border)',
              }}
            >
              {editingId === term.id ? (
                <>
                  <input
                    autoFocus
                    style={{ ...inputStyle, padding: '6px 10px' }}
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(term)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    disabled={savingEdit}
                  />
                  <button type="button" onClick={() => handleSaveEdit(term)} disabled={savingEdit} aria-label="Save" style={{ ...iconBtnStyle, color: 'var(--brand-dark)' }}>
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={savingEdit} aria-label="Cancel" style={iconBtnStyle}>
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', flex: 1 }}>{term.term}</span>
                  <button type="button" onClick={() => startEdit(term)} aria-label={`Edit ${term.term}`} style={iconBtnStyle}>
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(term)}
                    disabled={removingId === term.id}
                    aria-label={`Remove ${term.term}`}
                    style={{ ...iconBtnStyle, cursor: removingId === term.id ? 'not-allowed' : 'pointer', opacity: removingId === term.id ? 0.5 : 1 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
