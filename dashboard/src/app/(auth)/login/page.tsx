'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeIndianPhone } from '@/lib/phone'
import { logAuthEvent } from '@/lib/auth/log-auth-event'
import { Mail, Lock, ArrowRight, Eye, EyeOff, Phone, Shield } from 'lucide-react'

type Method = 'password' | 'phone'
type PhoneStep = 'input' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [method, setMethod] = useState<Method>('password')

  // Email/password state
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)

  // Phone/OTP state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input')
  const [phone, setPhone]         = useState('')
  const [otp, setOtp]             = useState('')

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

    logAuthEvent('login', 'password')
    router.push('/dashboard')
    router.refresh()
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const normalized = normalizeIndianPhone(phone)
    if (!normalized) {
      setError('Enter a valid 10-digit Indian mobile number')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to send OTP. Please try again.')
        setLoading(false)
        return
      }
    } catch {
      setError('Failed to send OTP. Please try again.')
      setLoading(false)
      return
    }

    setPhoneStep('otp')
    setLoading(false)
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const normalized = normalizeIndianPhone(phone)

    const { error } = await supabase.auth.verifyOtp({
      phone: normalized ?? phone,
      token: otp,
      type: 'sms',
    })

    if (error) {
      setError(error.message || 'Invalid OTP. Please try again.')
      setLoading(false)
      return
    }

    logAuthEvent('login', 'phone')
    router.push('/dashboard')
    router.refresh()
  }

  function switchMethod(next: Method) {
    setMethod(next)
    setError('')
    setPhoneStep('input')
    setOtp('')
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
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {method === 'password'
                ? 'Platform admin? Enter your email and password'
                : "Shop owner, manager or staff — we'll text you a one-time code"}
            </div>
          </div>

          {/* Method toggle */}
          <div style={{ display: 'flex', borderRadius: '8px', padding: '4px', background: '#0f172a', marginBottom: '20px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => switchMethod('password')}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', border: method === 'password' ? '1px solid #334155' : '1px solid transparent',
                background: method === 'password' ? '#1e293b' : 'transparent',
                color: method === 'password' ? '#f1f5f9' : '#64748b',
              }}
            >
              <Mail size={13} /> Email
            </button>
            <button
              type="button"
              onClick={() => switchMethod('phone')}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', border: method === 'phone' ? '1px solid #334155' : '1px solid transparent',
                background: method === 'phone' ? '#1e293b' : 'transparent',
                color: method === 'phone' ? '#f1f5f9' : '#64748b',
              }}
            >
              <Phone size={13} /> Phone
            </button>
          </div>

          {method === 'password' ? (
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
          ) : phoneStep === 'input' ? (
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={s.label}>Phone number</label>
                <div style={{ display: 'flex' }}>
                  <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: '8px 0 0 8px', border: '1px solid #334155', borderRight: 'none', background: '#0f172a', color: '#64748b', fontSize: '14px' }}>
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98765 43210"
                    required
                    maxLength={10}
                    autoFocus
                    style={{ ...s.input, borderRadius: '0 8px 8px 0' }}
                  />
                </div>
              </div>

              {error && <div style={s.error}>{error}</div>}

              <button
                type="submit"
                disabled={loading || phone.length < 10}
                style={{ ...s.btn, opacity: loading || phone.length < 10 ? 0.5 : 1 }}
              >
                {loading ? 'Sending...' : 'Send OTP'}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
                <Shield size={14} color="#22c55e" />
                Code sent to +91 {phone}
              </div>

              <div>
                <label style={s.label}>6-digit code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  maxLength={6}
                  autoFocus
                  style={{ ...s.input, textAlign: 'center', fontSize: '20px', letterSpacing: '0.4em' }}
                />
              </div>

              {error && <div style={s.error}>{error}</div>}

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                style={{ ...s.btn, opacity: loading || otp.length < 6 ? 0.5 : 1 }}
              >
                {loading ? 'Verifying...' : 'Verify & sign in'}
              </button>

              <button
                type="button"
                onClick={() => { setPhoneStep('input'); setOtp(''); setError('') }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ← Change number
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#475569', marginTop: '20px' }}>
          Access by invitation only ·{' '}
          <a href="mailto:admin@groovia.co.in" style={{ color: '#3b82f6' }}>admin@groovia.co.in</a>
        </p>
      </div>
    </div>
  )
}
