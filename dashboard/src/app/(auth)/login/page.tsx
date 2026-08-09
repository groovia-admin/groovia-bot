'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeIndianPhone } from '@/lib/phone'
import { logAuthEvent } from '@/lib/auth/log-auth-event'
import { Mail, Lock, ArrowRight, Eye, EyeOff, Phone, Shield, ShoppingCart } from 'lucide-react'

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
    page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'var(--surface)' },
    card:  { background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 12px rgba(11,28,48,0.06)' },
    input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: '#F7F8FA', color: 'var(--ink)', fontSize: '14px', outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
    btn:   { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '8px', border: 'none', background: 'var(--brand)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', position: 'relative', overflow: 'hidden' } as React.CSSProperties,
    label: { display: 'block', fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '6px', fontWeight: 600 } as React.CSSProperties,
    error: { background: 'var(--error-light)', border: '1px solid rgba(186,26,26,0.3)', color: 'var(--error)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px' },
  }

  // Cart-runs-through-the-button loading state — icon-only (no text) micro
  // interaction requested in place of a plain "Signing in..." label, using
  // the button's own width via % positioning so it scales to any button.
  function SubmitButtonContent({ loading, label }: { loading: boolean; label: string }) {
    if (loading) {
      return (
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '-15%',
            transform: 'translateY(-50%)',
            display: 'flex',
            animation: 'cartRun 1.1s ease-in-out infinite',
          }}
        >
          <ShoppingCart size={18} />
        </span>
      )
    }
    return (
      <>
        {label}
        <ArrowRight size={16} />
      </>
    )
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes loginCardIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginLogoIn {
          from { opacity: 0; transform: scale(0.75); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes cartRun {
          0%   { left: -15%; opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { left: 110%; opacity: 0; }
        }
        @keyframes cartOrbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes cartOrbitCounter {
          from { transform: translateX(-50%) rotate(0deg); }
          to   { transform: translateX(-50%) rotate(-360deg); }
        }
        .login-card-wrap { animation: loginCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .login-logo-wrap { animation: loginLogoIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .login-cart-orbit { position: absolute; inset: 0; animation: cartOrbit 5s linear infinite; }
        .login-cart-orbit-icon { animation: cartOrbitCounter 5s linear infinite; }
      `}</style>
      <div className="login-card-wrap" style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo — a circular WhatsApp-green "G" mark with a small cart icon
            orbiting the ring, echoing the cart-through-button micro
            interaction used on the submit buttons below. */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div className="login-logo-wrap" style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 10px' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px dashed rgba(0,104,95,0.35)' }} />
            <div
              style={{
                position: 'absolute',
                inset: '9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: 'var(--brand)',
                boxShadow: '0 2px 8px rgba(0,104,95,0.35)',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '22px' }}>G</span>
            </div>
            <div className="login-cart-orbit">
              <div
                className="login-cart-orbit-icon"
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '50%',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#fff',
                  border: '1px solid var(--surface-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 4px rgba(11,28,48,0.15)',
                }}
              >
                <ShoppingCart size={12} color="var(--brand-dark)" />
              </div>
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)' }}>GrooVia</div>
          <div style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>Admin Dashboard</div>
        </div>

        <div style={s.card}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Sign in</div>
            <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              {method === 'password'
                ? 'Platform admin? Enter your email and password'
                : "Shop owner, manager or staff — we'll text you a one-time code"}
            </div>
          </div>

          {/* Method toggle */}
          <div style={{ display: 'flex', borderRadius: '8px', padding: '4px', background: 'var(--surface)', marginBottom: '20px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => switchMethod('password')}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', border: method === 'password' ? '1px solid var(--surface-border)' : '1px solid transparent',
                background: method === 'password' ? '#FFFFFF' : 'transparent',
                color: method === 'password' ? 'var(--brand-dark)' : 'var(--ink-faint)',
                boxShadow: method === 'password' ? '0 1px 3px rgba(11,28,48,0.08)' : 'none',
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
                fontFamily: 'inherit', border: method === 'phone' ? '1px solid var(--surface-border)' : '1px solid transparent',
                background: method === 'phone' ? '#FFFFFF' : 'transparent',
                color: method === 'phone' ? 'var(--brand-dark)' : 'var(--ink-faint)',
                boxShadow: method === 'phone' ? '0 1px 3px rgba(11,28,48,0.08)' : 'none',
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
                  <Mail size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
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
                  <Lock size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
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
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', padding: 0 }}
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
                <SubmitButtonContent loading={loading} label="Sign in" />
              </button>
            </form>
          ) : phoneStep === 'input' ? (
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={s.label}>Phone number</label>
                <div style={{ display: 'flex' }}>
                  <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: '8px 0 0 8px', border: '1px solid var(--surface-border)', borderRight: 'none', background: 'var(--surface)', color: 'var(--ink-muted)', fontSize: '14px' }}>
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
                <SubmitButtonContent loading={loading} label="Send OTP" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ink-muted)' }}>
                <Shield size={14} color="var(--brand)" />
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
                <SubmitButtonContent loading={loading} label="Verify & sign in" />
              </button>

              <button
                type="button"
                onClick={() => { setPhoneStep('input'); setOtp(''); setError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ← Change number
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--ink-faint)', marginTop: '20px' }}>
          Access by invitation only ·{' '}
          <a href="mailto:admin@groovia.co.in" style={{ color: 'var(--brand-dark)' }}>admin@groovia.co.in</a>
        </p>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--ink-faint)', marginTop: '10px' }}>
          Powered by{' '}
          <span style={{ color: 'var(--brand-dark)', fontWeight: 700 }}>GrooVia</span>
        </p>
      </div>
    </div>
  )
}
