'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Phone, Mail, ArrowRight, Shield, ChevronDown } from 'lucide-react'
import { redirect } from 'next/navigation'


type Step = 'input' | 'otp'
type Method = 'phone' | 'email'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('input')
  const [method, setMethod] = useState<Method>('email')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
    if (digits.length === 10) return `+91${digits}`
    return `+${digits}`
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (method === 'email') {
       const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,
    emailRedirectTo: undefined
  }
})
        if (error) throw error
      } else {
        const formatted = formatPhone(phone)
        const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
        if (error) throw error
      }
      setStep('otp')
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let result

      if (method === 'email') {
        result = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: 'email',
        })
      } else {
        result = await supabase.auth.verifyOtp({
          phone: formatPhone(phone),
          token: otp,
          type: 'sms',
        })
      }

      if (result.error) throw result.error

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleBack() {
    setStep('input')
    setOtp('')
    setError('')
  }

  const contactDisplay = method === 'email' ? email : `+91 ${phone}`

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0f172a' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3" style={{ background: '#3b82f6' }}>
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <h1 className="text-2xl font-bold text-white">GrooVia</h1>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>Admin Dashboard</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 border" style={{ background: '#1e293b', borderColor: '#334155' }}>

          {step === 'input' ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg" style={{ background: '#3b82f620' }}>
                  {method === 'email'
                    ? <Mail className="w-5 h-5" style={{ color: '#3b82f6' }} />
                    : <Phone className="w-5 h-5" style={{ color: '#3b82f6' }} />
                  }
                </div>
                <div>
                  <h2 className="font-semibold text-white">Sign in</h2>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>We'll send a code to verify you</p>
                </div>
              </div>

              {/* Method toggle */}
              <div className="flex rounded-lg p-1 mb-5" style={{ background: '#0f172a' }}>
                <button
                  type="button"
                  onClick={() => { setMethod('email'); setError('') }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all"
                  style={{
                    background: method === 'email' ? '#1e293b' : 'transparent',
                    color: method === 'email' ? '#f1f5f9' : '#64748b',
                    border: method === 'email' ? '1px solid #334155' : '1px solid transparent'
                  }}
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => { setMethod('phone'); setError('') }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all"
                  style={{
                    background: method === 'phone' ? '#1e293b' : 'transparent',
                    color: method === 'phone' ? '#f1f5f9' : '#64748b',
                    border: method === 'phone' ? '1px solid #334155' : '1px solid transparent'
                  }}
                >
                  <Phone className="w-3.5 h-3.5" /> Phone
                </button>
              </div>

              <form onSubmit={handleSendOTP} className="space-y-4">

                {method === 'email' ? (
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@groovia.co.in"
                      required
                      autoFocus
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none transition-colors"
                      style={{ background: '#0f172a', border: '1px solid #334155' }}
                      onFocus={e => e.target.style.borderColor = '#3b82f6'}
                      onBlur={e => e.target.style.borderColor = '#334155'}
                    />
                    <p className="text-xs mt-1.5" style={{ color: '#475569' }}>
                      ✓ Works instantly — no SMS provider needed
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                      Phone number
                    </label>
                    <div className="flex">
                      <span
                        className="flex items-center px-3 rounded-l-lg text-sm"
                        style={{ background: '#0f172a', border: '1px solid #334155', borderRight: 'none', color: '#64748b' }}
                      >
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
                        className="flex-1 px-3 py-2.5 rounded-r-lg text-sm text-white outline-none"
                        style={{ background: '#0f172a', border: '1px solid #334155' }}
                      />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: '#f59e0b' }}>
                      ⚠ Requires SMS provider (Textlocal) to be configured
                    </p>
                  </div>
                )}

                {error && (
                  <div className="text-xs px-3 py-2.5 rounded-lg" style={{ color: '#f87171', background: '#ef444420', border: '1px solid #ef444430' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || (method === 'email' ? !email : phone.length < 10)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#3b82f6', color: '#fff' }}
                >
                  {loading ? 'Sending...' : 'Send OTP'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* OTP step */}
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg" style={{ background: '#22c55e20' }}>
                  <Shield className="w-5 h-5" style={{ color: '#22c55e' }} />
                </div>
                <div>
                  <h2 className="font-semibold text-white">Enter OTP</h2>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>
                    {method === 'email' ? 'Check your email inbox' : 'Sent via SMS'} · {contactDisplay}
                  </p>
                </div>
              </div>

              {method === 'email' && (
                <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: '#3b82f610', border: '1px solid #3b82f630', color: '#93c5fd' }}>
                  Check your inbox for a 6-digit code from Supabase. Also check spam.
                </div>
              )}

              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                    6-digit code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                    maxLength={6}
                    autoFocus
                    className="w-full px-3 py-3 rounded-lg text-center text-2xl font-mono tracking-[0.5em] text-white outline-none"
                    style={{ background: '#0f172a', border: '1px solid #334155', letterSpacing: '0.4em' }}
                  />
                </div>

                {error && (
                  <div className="text-xs px-3 py-2.5 rounded-lg" style={{ color: '#f87171', background: '#ef444420', border: '1px solid #ef444430' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#3b82f6', color: '#fff' }}
                >
                  {loading ? 'Verifying...' : 'Verify & Sign in'}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2.5 rounded-lg text-sm transition-all"
                  style={{ background: '#334155', color: '#94a3b8' }}
                >
                  ← Change {method === 'email' ? 'email' : 'number'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#475569' }}>
          Access is by invitation only · {' '}
          <a href="mailto:admin@groovia.co.in" style={{ color: '#3b82f6' }}>
            admin@groovia.co.in
          </a>
        </p>
      </div>
    </div>
  )
}