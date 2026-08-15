'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeIndianPhone } from '@/lib/phone'
import { logAuthEvent } from '@/lib/auth/log-auth-event'
import { Mail, Lock, ArrowRight, Eye, EyeOff, Phone, Shield, Check, TrendingUp, MessageCircle } from 'lucide-react'
import GrooviaMark from '@/components/ui/GrooviaMark'

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
        /* Top-aligned, not vertically centered, below 960px — a centered
           form is where mobile keyboards do the most damage: opening the
           keyboard shrinks the visible viewport, and a centered card can
           end up partly or fully hidden behind it (reported as the OTP
           step "going out of screen" while typing). Top alignment means
           the keyboard only ever eats into empty space below the card. */
        .login-form-side { display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px; }
        .login-showcase { display: none; }
        @media (min-width: 960px) {
          .login-showcase { display: flex; }
          .login-form-side { flex: 1; align-items: center; padding: 16px; }
        }
        .glow { position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; }
        .float-card { position: absolute; background: #fff; border-radius: 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.3); }
      `}</style>

      {/* Left — the login form. */}
      <div className="login-form-side" style={{ flex: '0 0 auto', width: '100%', maxWidth: '520px', background: 'var(--surface)' }}>
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

      {/* Right — a real shop photo (not stock, not illustrated) with floating
          cards showing the product in motion: an order arriving over
          WhatsApp, that same order landing in the dashboard. 48px of teal
          shows around the photo on every side — it's a framed card, not a
          full-bleed background — and the photo fills that frame completely
          (no inner max-width cap), so it reads as large rather than an
          image floating in empty space. */}
      <div
        className="login-showcase"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          background: 'linear-gradient(160deg, #00685F 0%, #004B44 65%, #00332E 100%)',
        }}
      >
        <div className="glow" style={{ width: 420, height: 420, background: '#89F5E7', opacity: 0.15, top: -140, left: -100 }} />
        <div className="glow" style={{ width: 320, height: 320, background: '#6BD8CB', opacity: 0.12, bottom: -80, right: -60 }} />

        <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', borderRadius: 24, overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,0.4)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/login-shop-photo.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,20,18,0.05) 0%, rgba(0,15,13,0.4) 100%)' }} />

          <div className="float-card" style={{ top: -14, left: -18, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 10px' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#DCF8C6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-dark)', flexShrink: 0 }}>
              <Check size={14} strokeWidth={3} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>New Order Received</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>via chat · just now</div>
            </div>
          </div>

          <div className="float-card" style={{ top: -10, right: -14, background: 'var(--ink)', borderRadius: 999, padding: '7px 14px 7px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#89F5E7', flexShrink: 0 }}>
              <TrendingUp size={11} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>This Month</div>
              <div style={{ fontSize: 13.5, color: '#fff', fontWeight: 800 }}>₹3.2L</div>
            </div>
          </div>

          <div className="float-card" style={{ top: 90, right: -22, width: 190, padding: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <MessageCircle size={10} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>Priya Sharma</div>
            </div>
            <div style={{ background: '#DCF8C6', borderRadius: '8px 8px 8px 2px', padding: '7px 9px', fontSize: 11, color: 'var(--ink)', lineHeight: 1.4 }}>
              2x Amul Milk, 1x Bread — ready by 6pm?
            </div>
            <div style={{ textAlign: 'right', marginTop: 4, fontSize: 9, color: 'var(--ink-faint)' }}>7:42 PM ✓✓</div>
          </div>

          <div className="float-card" style={{ bottom: -20, left: -22, width: 230, padding: 15 }}>
            <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', margin: '2px 0 9px' }}>Live Orders</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 9 }}>
              <div style={{ borderRadius: 9, padding: 8, background: 'var(--surface)' }}>
                <div style={{ fontSize: 9, color: 'var(--ink-muted)' }}>Orders</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: '2px 0' }}>47</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--brand-dark)' }}>↗ +12%</div>
              </div>
              <div style={{ borderRadius: 9, padding: 8, background: 'var(--brand)', color: '#fff' }}>
                <div style={{ fontSize: 9, opacity: 0.8 }}>Revenue</div>
                <div style={{ fontSize: 15, fontWeight: 800, margin: '2px 0' }}>₹18,240</div>
                <div style={{ fontSize: 9, fontWeight: 700 }}>↗ +28%</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--surface-border)', fontSize: 11, color: 'var(--ink)' }}>
              <span>Rajesh K.</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(0,104,95,0.12)', color: 'var(--brand-dark)' }}>NEW</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--surface-border)', fontSize: 11, color: 'var(--ink)' }}>
              <span>Anita D.</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#B7791F' }}>READY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
