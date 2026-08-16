'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
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

export default function RestrictedItemsClient({ initialTerms }: { initialTerms: Term[] }) {
  const toast = useToast()
  const [terms, setTerms] = useState<Term[]>(initialTerms)
  const [newTerm, setNewTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

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
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
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

      {terms.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', textAlign: 'center', padding: '20px 0' }}>
          No restricted terms yet — every shop can add any product name.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {terms.map((term) => (
            <div
              key={term.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 4px',
                borderBottom: '1px solid var(--surface-border)',
              }}
            >
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--ink)' }}>{term.term}</span>
              <button
                type="button"
                onClick={() => handleRemove(term)}
                disabled={removingId === term.id}
                aria-label={`Remove ${term.term}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-faint)',
                  cursor: removingId === term.id ? 'not-allowed' : 'pointer',
                  padding: 6,
                  opacity: removingId === term.id ? 0.5 : 1,
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
