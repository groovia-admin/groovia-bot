'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeIndianPhone } from '@/lib/phone'
import { logAuthEvent } from '@/lib/auth/log-auth-event'
import { Mail, Lock, ArrowRight, Eye, EyeOff, Phone, Shield, MessageSquare, PackageCheck, Store } from 'lucide-react'
import GrooviaMark from '@/components/ui/GrooviaMark'

type Method = 'password' | 'phone'
type PhoneStep = 'input' | 'otp'

const FEATURES = [
  { icon: MessageSquare, text: 'Orders arrive straight from WhatsApp' },
  { icon: PackageCheck, text: 'Real-time order and inventory tracking' },
  { icon: Store, text: 'Built for Indian kirana and grocery shops' },
]

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
    input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: '#F7F8FA', color: 'var(--ink)', fontSize: "var(--text-md)", outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
    btn:   { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '8px', border: 'none', background: 'var(--brand)', color: '#fff', fontSize: "var(--text-md)", fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', position: 'relative' } as React.CSSProperties,
    label: { display: 'block', fontSize: "var(--text-sm)", color: 'var(--ink-muted)', marginBottom: '6px', fontWeight: 600 } as React.CSSProperties,
    error: { background: 'var(--error-light)', border: '1px solid rgba(186,26,26,0.3)', color: 'var(--error)', padding: '10px 14px', borderRadius: '8px', fontSize: "var(--text-sm)" },
  }

  // Plain rotating-arc spinner — the standard SaaS-product loading
  // affordance (Stripe/GitHub/Material all use this exact pattern), not
  // a themed micro-interaction.
  function SubmitButtonContent({ loading, label }: { loading: boolean; label: string }) {
    if (loading) {
      return <span className="btn-spinner" aria-label="Loading" />
    }
    return (
      <>
        {label}
        <ArrowRight size={16} />
      </>
    )
  }

  return (
    // 100dvh, not 100vh — on mobile browsers 100vh includes the address
    // bar's collapsed height, which left a sliver of unstyled page below
    // the fold; 100dvh tracks the actually-visible viewport.
    <div style={{ minHeight: '100dvh', display: 'flex' }}>
      <style>{`
        @keyframes loginCardIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginLogoIn {
          from { opacity: 0; transform: scale(0.75); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes btnSpin { to { transform: rotate(360deg); } }
        .btn-spinner {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          animation: btnSpin 0.7s linear infinite;
        }
        .login-card-wrap { animation: loginCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .login-logo-wrap { animation: loginLogoIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .login-showcase { display: none; }
        @media (min-width: 960px) {
          .login-showcase { display: flex; }
          .login-form-side { flex: 1; }
        }
        .glow { position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; }
      `}</style>

      {/* Left showcase panel — hidden below 960px, form-only on mobile/tablet.
          100% height of the flex row (itself min-height: 100dvh), not a
          fixed pixel value, so it always fills the viewport exactly. */}
      <div
        className="login-showcase"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          background: 'linear-gradient(160deg, #00685F 0%, #004B44 65%, #00332E 100%)',
        }}
      >
        <div className="glow" style={{ width: 420, height: 420, background: '#89F5E7', opacity: 0.18, top: -140, left: -100 }} />
        <div className="glow" style={{ width: 320, height: 320, background: '#6BD8CB', opacity: 0.14, bottom: -80, right: -60 }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <GrooviaMark size={30} variant="white" />
          <span style={{ color: '#fff', fontSize: "var(--text-md)", fontWeight: 800, letterSpacing: '-0.01em' }}>GrooVia</span>
        </div>

        <div style={{ position: 'relative', maxWidth: '440px' }}>
          <h1 style={{ color: '#fff', fontSize: '34px', fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
            Run your shop from wherever you are.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: "var(--text-md)", lineHeight: 1.6, margin: 0 }}>
            The admin dashboard behind your WhatsApp storefront — orders, inventory and customers, all in one place.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '32px' }}>
            {FEATURES.map((f) => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={15} color="#89F5E7" />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: "var(--text-base)", fontWeight: 500 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ position: 'relative', color: 'rgba(255,255,255,0.45)', fontSize: "var(--text-xs)", margin: 0 }}>
          © {new Date().getFullYear()} GrooVia · Built for India's neighborhood stores
        </p>
      </div>

      {/* Right side — the existing login form, unchanged, just no longer
          centered full-width. */}
      <div className="login-form-side" style={{ flex: '0 0 auto', width: '100%', maxWidth: '520px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'var(--surface)' }}>
        <div className="login-card-wrap" style={{ width: '100%', maxWidth: '380px' }}>

          <div className="login-logo-wrap" style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ display: 'inline-flex', marginBottom: '10px' }}>
              <GrooviaMark size={52} />
            </div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)' }}>GrooVia</div>
            <div style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', marginTop: '2px' }}>Admin Dashboard</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(11,28,48,0.06)' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Sign in</div>
              <div style={{ fontSize: "var(--text-sm)", color: 'var(--ink-muted)' }}>
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
                  padding: '8px', borderRadius: '6px', fontSize: "var(--text-base)", fontWeight: 600, cursor: 'pointer',
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
                  padding: '8px', borderRadius: '6px', fontSize: "var(--text-base)", fontWeight: 600, cursor: 'pointer',
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
                    <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: '8px 0 0 8px', border: '1px solid var(--surface-border)', borderRight: 'none', background: 'var(--surface)', color: 'var(--ink-muted)', fontSize: "var(--text-md)" }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: "var(--text-sm)", color: 'var(--ink-muted)' }}>
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
                    style={{ ...s.input, textAlign: 'center', fontSize: "var(--text-xl)", letterSpacing: '0.4em' }}
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
                  style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: "var(--text-sm)", cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ← Change number
                </button>
              </form>
            )}
          </div>

          <p style={{ textAlign: 'center', fontSize: "var(--text-xs)", color: 'var(--ink-faint)', marginTop: '20px' }}>
            Access by invitation only ·{' '}
            <a href="mailto:admin@groovia.co.in" style={{ color: 'var(--brand-dark)' }}>admin@groovia.co.in</a>
          </p>

          <p style={{ textAlign: 'center', fontSize: "var(--text-xs)", color: 'var(--ink-faint)', marginTop: '10px' }}>
            Powered by{' '}
            <span style={{ color: 'var(--brand-dark)', fontWeight: 700 }}>GrooVia</span>
          </p>
        </div>
      </div>
    </div>
  )
}
