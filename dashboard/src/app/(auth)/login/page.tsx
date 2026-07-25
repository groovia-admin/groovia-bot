'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const s = {
    page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: '#0f172a' },
    card:  { background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px' },
    input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '14px', outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
    btn:   { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
    label: { display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 } as React.CSSProperties,
    error: { background: '#ef444420', border: '1px solid #ef444430', color: '#f87171', padding: '10px 14px', borderRadius: '8px', fontSize: '12px' },
  }

  return (
    <div style={s.page}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '14px', background: '#3b82f6', marginBottom: '10px' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '22px' }}>G</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9' }}>GrooVia</div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>Admin Dashboard</div>
        </div>

        <div style={s.card}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>Sign in</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Enter your email and password</div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={s.label}>Email address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@groovia.co.in"
                  required
                  autoFocus
                  style={{ ...s.input, paddingLeft: '36px' }}
                />
              </div>
            </div>

            <div>
              <label style={s.label}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ ...s.input, paddingLeft: '36px', paddingRight: '36px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && <div style={s.error}>{error}</div>}

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{ ...s.btn, opacity: loading || !email || !password ? 0.5 : 1 }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#475569', marginTop: '20px' }}>
          Access by invitation only ·{' '}
          <a href="mailto:admin@groovia.co.in" style={{ color: '#3b82f6' }}>admin@groovia.co.in</a>
        </p>
      </div>
    </div>
  )
}