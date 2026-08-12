'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bricolage_Grotesque } from 'next/font/google'
import { createClient } from '@/lib/supabase/client'
import { normalizeIndianPhone } from '@/lib/phone'
import { logAuthEvent } from '@/lib/auth/log-auth-event'
import GrooviaMark from '@/components/ui/GrooviaMark'

// Inter is already loaded globally (see app/layout.tsx, --font-inter) — only
// Bricolage Grotesque (headings) needs loading here, self-hosted via
// next/font like every other font in the app, not the Google Fonts CDN
// <link> the source design used (blocked by a strict CSP anyway).
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-bricolage', display: 'swap' })

type Method = 'phone' | 'email'
type PhoneStep = 'input' | 'otp'

const OTP_LENGTH = 6
const RESEND_SECONDS = 30

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [method, setMethod] = useState<Method>('phone')

  // Phone/OTP state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(''))
  const [otpError, setOtpError] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const [resendIn, setResendIn] = useState(RESEND_SECONDS)

  // Email/password state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState({ msg: '', show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function ping(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, show: true })
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2600)
  }

  // Counts down only while the OTP step is showing — resets whenever a
  // fresh code is actually sent (initial send or a resend), not on mount.
  useEffect(() => {
    if (phoneStep !== 'otp' || resendIn <= 0) return
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [phoneStep, resendIn])

  function switchMethod(next: Method) {
    setMethod(next)
    setPhoneStep('input')
    setPhoneError('')
    setOtpError('')
    setEmailError('')
    setPasswordError('')
    setOtpDigits(Array(OTP_LENGTH).fill(''))
  }

  async function sendOtp(phoneValue: string): Promise<boolean> {
    const normalized = normalizeIndianPhone(phoneValue)
    if (!normalized) {
      setPhoneError('Enter a valid 10-digit mobile number.')
      return false
    }

    setLoading(true)
    setPhoneError('')

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      const data = await response.json()

      if (!response.ok) {
        setPhoneError(data.error || 'Failed to send OTP. Please try again.')
        setLoading(false)
        return false
      }
    } catch {
      setPhoneError('Failed to send OTP. Please try again.')
      setLoading(false)
      return false
    }

    setLoading(false)
    return true
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (phone.length !== 10) {
      setPhoneError('Enter a valid 10-digit mobile number.')
      return
    }

    const ok = await sendOtp(phone)
    if (!ok) return

    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setOtpError('')
    setResendIn(RESEND_SECONDS)
    setPhoneStep('otp')
    ping('Code sent on WhatsApp')
    setTimeout(() => otpRefs.current[0]?.focus(), 0)
  }

  function handleChangeNumber(e: React.MouseEvent) {
    e.preventDefault()
    setPhoneStep('input')
    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setOtpError('')
  }

  async function handleResend() {
    if (resendIn > 0) return
    const ok = await sendOtp(phone)
    if (!ok) return
    setResendIn(RESEND_SECONDS)
    ping('New code sent')
  }

  function updateOtpDigit(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setOtpDigits((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    setOtpError('')
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus()
    if (e.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH).split('')
    if (digits.length === 0) return
    setOtpDigits((prev) => {
      const next = [...prev]
      digits.forEach((d, i) => { next[i] = d })
      return next
    })
    otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    const code = otpDigits.join('')
    if (code.length !== OTP_LENGTH) {
      setOtpError("That code doesn't match. Check and try again.")
      return
    }

    setOtpError('')
    setLoading(true)

    const normalized = normalizeIndianPhone(phone)
    const { error } = await supabase.auth.verifyOtp({ phone: normalized ?? phone, token: code, type: 'sms' })

    if (error) {
      setOtpError(error.message || "That code doesn't match. Check and try again.")
      setLoading(false)
      return
    }

    logAuthEvent('login', 'phone')
    ping('Verified — signing in…')
    router.push('/dashboard')
    router.refresh()
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    setEmailError(validEmail ? '' : 'Enter a valid email address.')
    setPasswordError(password ? '' : 'Enter your password.')
    if (!validEmail || !password) return

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setPasswordError(error.message)
      setLoading(false)
      return
    }

    logAuthEvent('login', 'password')
    router.push('/dashboard')
    router.refresh()
  }

  const sentTo = phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : '+91 ·····'

  return (
    <div className={bricolage.variable}>
      <style>{`
        :root{
          --teal-900:#063B35;
          --teal-800:#0A554C;
          --teal-700:#0B6B5F;
          --teal-600:#0E8375;
          --teal-500:#12A594;
          --wa-green:#1FAF5B;
          --bg:#F5F8F7;
          --panel:#FFFFFF;
          --ink:#0E1B19;
          --muted:#5C6B68;
          --line:#E4EAE8;
          --field:#F3F6F5;
          --field-line:#DCE4E2;
          --danger:#C23B2E;
          --hero-img:url('https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1500&q=70');
          --r-lg:20px;
          --r-md:14px;
          --r-sm:11px;
          --shadow:0 24px 60px -30px rgba(6,59,53,.45);
        }
        .login-root *{box-sizing:border-box}
        .login-root{
          font-family: var(--font-inter), system-ui, -apple-system, sans-serif;
          color:var(--ink);
          background:var(--bg);
          -webkit-font-smoothing:antialiased;
          text-rendering:optimizeLegibility;
          min-height:100dvh;
        }
        .shell{ min-height:100dvh; display:grid; grid-template-columns:1.05fr 1fr; }

        .hero{
          position:relative; overflow:hidden; padding:44px 48px;
          display:flex; flex-direction:column; justify-content:space-between;
          color:#EAF6F3; background-color:var(--teal-800); isolation:isolate;
        }
        .hero__photo{ position:absolute; inset:0; z-index:-2; background-image:var(--hero-img); background-size:cover; background-position:center; transform:scale(1.04); }
        .hero__wash{
          position:absolute; inset:0; z-index:-1;
          background:
            radial-gradient(120% 90% at 12% 8%, rgba(18,165,148,.34), transparent 55%),
            linear-gradient(155deg, rgba(6,59,53,.82) 8%, rgba(10,85,76,.86) 52%, rgba(6,59,53,.94) 100%);
        }

        .brandmark{display:flex;align-items:center;gap:13px}
        .brandmark .logo-wrap{filter:drop-shadow(0 3px 8px rgba(0,0,0,.25))}
        .brandmark .name{ font-family: var(--font-bricolage), sans-serif; font-weight:700;font-size:26px;letter-spacing:-.02em;color:#fff;line-height:1; }
        .brandmark .sub{display:block;font-family: var(--font-inter);font-weight:500;font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(234,246,243,.72);margin-top:4px}

        .hero__body{max-width:30ch}
        .hero__eyebrow{
          display:inline-flex;align-items:center;gap:8px;
          font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
          color:#BEEDE2; background:rgba(9,66,60,.5); border:1px solid rgba(190,237,226,.28);
          padding:6px 12px;border-radius:999px; backdrop-filter:blur(3px);
        }
        .hero__eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--wa-green);box-shadow:0 0 0 4px rgba(31,175,91,.25)}
        .hero h1{
          font-family: var(--font-bricolage), sans-serif;
          font-weight:600;font-size:clamp(30px,3.4vw,44px);line-height:1.06;letter-spacing:-.02em;
          color:#fff;margin:22px 0 14px;
        }
        .hero h1 em{font-style:normal;color:#8BE3D0}
        .hero__body p{font-size:15px;line-height:1.6;color:rgba(234,246,243,.82);margin:0}

        .hero__points{list-style:none;margin:26px 0 0;padding:0;display:grid;gap:12px}
        .hero__points li{display:flex;align-items:center;gap:11px;font-size:14px;color:rgba(234,246,243,.9)}
        .hero__points svg{flex:none;color:#8BE3D0}

        .hero__foot{display:flex;align-items:center;gap:10px;font-size:12.5px;color:rgba(234,246,243,.62)}
        .hero__foot .tick{width:6px;height:6px;border-radius:50%;background:var(--teal-500)}

        .pane{ display:flex;flex-direction:column; padding:40px 40px 26px; background:var(--panel); }
        .pane__inner{ flex:1; width:100%;max-width:392px;margin:0 auto; display:flex;flex-direction:column;justify-content:center; }

        .pane__brand{display:none;align-items:center;gap:10px;margin-bottom:26px}
        .pane__brand .name{font-family: var(--font-bricolage);font-weight:700;font-size:20px;letter-spacing:-.02em}

        .head{text-align:center}
        .head h2{ font-family: var(--font-bricolage), sans-serif; font-weight:700;font-size:27px;letter-spacing:-.02em;margin:0 0 6px; }
        .head p{margin:0 0 22px;color:var(--muted);font-size:14.5px;line-height:1.5}

        .seg{
          display:grid;grid-template-columns:1fr 1fr;gap:4px;
          background:var(--field);border:1px solid var(--field-line);
          padding:4px;border-radius:var(--r-md);margin-bottom:22px;
        }
        .seg button{
          appearance:none;border:0;cursor:pointer;
          font-family:inherit;font-size:14px;font-weight:600;color:var(--muted);
          padding:10px 12px;border-radius:10px;background:transparent;
          display:inline-flex;align-items:center;justify-content:center;gap:8px;
          transition:background .18s ease,color .18s ease,box-shadow .18s ease;
        }
        .seg button svg{width:16px;height:16px}
        .seg button[aria-selected="true"]{
          background:var(--panel);color:var(--teal-700);
          box-shadow:0 1px 2px rgba(6,59,53,.14),0 3px 8px -4px rgba(6,59,53,.2);
        }

        .field{margin-bottom:16px}
        .field > label{display:block;font-size:13px;font-weight:600;margin-bottom:7px;color:var(--ink)}

        .control{
          display:flex;align-items:center;gap:10px;
          background:var(--field); border:1.5px solid var(--field-line); border-radius:var(--r-md);
          padding:0 14px;height:52px;
          transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;
        }
        .control:focus-within{ border-color:var(--teal-600);background:#fff; box-shadow:0 0 0 4px rgba(14,131,117,.13); }
        .control .lead{display:flex;align-items:center;color:var(--muted)}
        .control .lead svg{width:18px;height:18px}
        .control input{ flex:1;border:0;outline:0;background:transparent; font-family:inherit;font-size:15.5px;color:var(--ink);min-width:0; }
        .control input::placeholder{color:#9AA8A5}

        .prefix{
          display:flex;align-items:center;gap:7px;padding-right:12px;margin-right:2px;
          border-right:1.5px solid var(--field-line);
          font-size:15px;font-weight:600;color:var(--ink);white-space:nowrap;
        }
        .prefix .flag{
          width:22px;height:15px;border-radius:3px;overflow:hidden;flex:none;
          background:linear-gradient(#FF9933 0 33.33%,#fff 33.33% 66.66%,#138808 66.66%);
          box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);position:relative;
        }
        .prefix .flag::after{content:"";position:absolute;left:50%;top:50%;width:5px;height:5px;transform:translate(-50%,-50%);border-radius:50%;border:1px solid #17458f}

        .eye{appearance:none;border:0;background:transparent;cursor:pointer;color:var(--muted);display:flex;padding:4px;border-radius:8px}
        .eye:hover{color:var(--ink)}
        .eye svg{width:19px;height:19px}

        .rowsplit{display:flex;align-items:center;justify-content:space-between;margin:2px 0 20px}
        .check{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:var(--muted);cursor:pointer;user-select:none}
        .check input{position:absolute;opacity:0;width:0;height:0}
        .check .box{width:19px;height:19px;border-radius:6px;border:1.5px solid var(--field-line);background:var(--field);display:grid;place-items:center;transition:.15s}
        .check .box svg{width:12px;height:12px;color:#fff;opacity:0;transform:scale(.6);transition:.15s}
        .check input:checked + .box{background:var(--teal-700);border-color:var(--teal-700)}
        .check input:checked + .box svg{opacity:1;transform:scale(1)}
        .check input:focus-visible + .box{box-shadow:0 0 0 4px rgba(14,131,117,.18)}
        .link{font-size:13.5px;font-weight:600;color:var(--teal-700);text-decoration:none}
        .link:hover{text-decoration:underline}

        .btn{
          width:100%;height:54px;border:0;cursor:pointer;
          border-radius:var(--r-md);
          font-family:inherit;font-size:15.5px;font-weight:600;color:#fff;
          background:linear-gradient(180deg,var(--teal-600),var(--teal-700));
          box-shadow:0 12px 26px -14px rgba(11,107,95,.9),inset 0 1px 0 rgba(255,255,255,.16);
          display:inline-flex;align-items:center;justify-content:center;gap:10px;
          transition:transform .12s ease,box-shadow .18s ease,filter .18s ease;
        }
        .btn:hover:not(:disabled){filter:brightness(1.04)}
        .btn:active:not(:disabled){transform:translateY(1px)}
        .btn:disabled{opacity:.55;cursor:not-allowed;filter:none}
        .btn svg{width:18px;height:18px}

        @keyframes btnSpin { to { transform: rotate(360deg); } }
        .btn-spinner{
          width:18px;height:18px;border-radius:50%;
          border:2.5px solid rgba(255,255,255,.35); border-top-color:#fff;
          animation:btnSpin .7s linear infinite;
        }

        .wa-note{ display:flex;align-items:center;gap:8px;justify-content:center; margin-top:14px;font-size:12.5px;color:var(--muted); }
        .wa-note svg{width:15px;height:15px;color:var(--wa-green)}

        .otp-sent{font-size:14px;color:var(--muted);margin:0 0 18px;line-height:1.5;text-align:center}
        .otp-sent b{color:var(--ink)}
        .otp-sent a{color:var(--teal-700);font-weight:600;text-decoration:none;margin-left:6px}
        .otp-sent a:hover{text-decoration:underline}
        .otp-boxes{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-bottom:16px}
        .otp-boxes input{
          height:56px;text-align:center;
          font-family: var(--font-bricolage), sans-serif;font-size:22px;font-weight:600;color:var(--ink);
          background:var(--field);border:1.5px solid var(--field-line);border-radius:var(--r-md);
          outline:0;transition:.15s;
        }
        .otp-boxes input:focus{border-color:var(--teal-600);background:#fff;box-shadow:0 0 0 4px rgba(14,131,117,.13)}
        .otp-boxes input.filled{border-color:var(--teal-500);color:var(--teal-700)}
        .resend{margin-top:14px;text-align:center;font-size:13px;color:var(--muted)}
        .resend button{appearance:none;border:0;background:0;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:var(--teal-700)}
        .resend button:disabled{color:#9AA8A5;cursor:default}

        .err{display:none;color:var(--danger);font-size:12.5px;font-weight:500;margin-top:7px}
        .err.show{display:block}

        .invite{ margin-top:24px;text-align:center;font-size:12.5px;color:var(--muted);line-height:1.5; padding-top:20px;border-top:1px solid var(--line); }
        .invite a{color:var(--teal-700);font-weight:600;text-decoration:none}
        .invite a:hover{text-decoration:underline}

        .powered{ margin-top:auto;padding-top:26px;text-align:center; font-size:12px;letter-spacing:.02em;color:#93A29F; }
        .powered b{ font-family: var(--font-bricolage);font-weight:700;color:var(--teal-700);letter-spacing:-.01em; }

        .toast{
          position:fixed;left:50%;bottom:26px;transform:translate(-50%,120%);
          background:var(--teal-900);color:#EAF6F3;
          padding:13px 18px;border-radius:12px;font-size:13.5px;font-weight:500;
          display:flex;align-items:center;gap:10px;
          box-shadow:0 18px 40px -18px rgba(0,0,0,.6);opacity:0;
          transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s;z-index:50;
        }
        .toast.show{transform:translate(-50%,0);opacity:1}
        .toast svg{width:17px;height:17px;color:#8BE3D0}

        .login-root :focus-visible{outline:2px solid var(--teal-500);outline-offset:2px;border-radius:6px}

        @media (max-width:920px){
          .shell{grid-template-columns:1fr}
          .hero{display:none}
          .pane{padding:26px 20px 20px;min-height:100dvh}
          .pane__brand{display:flex}
        }
        @media (prefers-reduced-motion:reduce){
          .login-root *{transition:none !important;animation:none !important}
        }
      `}</style>

      <main className="shell login-root">
        {/* ================= HERO ================= */}
        <section className="hero">
          <div className="hero__photo" />
          <div className="hero__wash" />

          <div className="brandmark">
            <span className="logo-wrap"><GrooviaMark size={44} variant="white" /></span>
            <div>
              <span className="name">GrooVia</span>
              <span className="sub">Admin Dashboard</span>
            </div>
          </div>

          <div className="hero__body">
            <span className="hero__eyebrow"><span className="dot" />WhatsApp Commerce</span>
            <h1>Run your <em>kirana</em> from one dashboard.</h1>
            <p>Orders, catalogue, khata and staff — managed in one place while your customers shop right inside WhatsApp.</p>
            <ul className="hero__points">
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Live orders &amp; stock, synced to WhatsApp</li>
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Khata credit book &amp; UPI payments</li>
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Roles for owners, managers &amp; staff</li>
            </ul>
          </div>

          <div className="hero__foot"><span className="tick" /> Trusted by neighbourhood stores across India</div>
        </section>

        {/* ================= FORM ================= */}
        <section className="pane">
          <div className="pane__inner">
            <div className="pane__brand">
              <GrooviaMark size={34} />
              <span className="name">GrooVia</span>
            </div>

            <div className="head">
              <h2>Sign in</h2>
              <p>Welcome back. Sign in to manage your store.</p>
            </div>

            <div className="seg" role="tablist" aria-label="Sign-in method">
              <button type="button" role="tab" id="tab-phone" aria-selected={method === 'phone'} aria-controls="p-phone" onClick={() => switchMethod('phone')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                Phone
              </button>
              <button type="button" role="tab" id="tab-email" aria-selected={method === 'email'} aria-controls="p-email" onClick={() => switchMethod('email')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
                Email
              </button>
            </div>

            {method === 'phone' ? (
              <div id="p-phone" role="tabpanel" aria-labelledby="tab-phone">
                {phoneStep === 'input' ? (
                  <form onSubmit={handlePhoneSubmit} noValidate>
                    <div className="field">
                      <label htmlFor="phone">Phone number</label>
                      <div className="control">
                        <span className="prefix"><span className="flag" />+91</span>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={10}
                          placeholder="98XXX XXXXX"
                          autoFocus
                          value={phone}
                          onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setPhoneError('') }}
                        />
                      </div>
                      <p className={`err${phoneError ? ' show' : ''}`}>{phoneError || 'Enter a valid 10-digit mobile number.'}</p>
                    </div>
                    <button className="btn" type="submit" disabled={loading}>
                      {loading ? (
                        <span className="btn-spinner" aria-label="Loading" />
                      ) : (
                        <>
                          Send code
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </>
                      )}
                    </button>
                    <p className="wa-note">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.13c-.24.68-1.2 1.26-1.97 1.42-.53.11-1.22.2-3.56-.76-2.99-1.24-4.9-4.28-5.05-4.48-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37h.57c.18 0 .42-.07.66.5.24.58.82 2.02.89 2.17.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12 1 2.07 1.31 2.37 1.46.3.15.47.12.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.7.8 1.99.95.3.15.49.22.56.35.07.12.07.72-.17 1.4z" /></svg>
                      We&apos;ll send a 6-digit code on WhatsApp
                    </p>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} noValidate>
                    <p className="otp-sent">Enter the code sent to <b>{sentTo}</b><a href="#" onClick={handleChangeNumber}>Change</a></p>
                    <div className="otp-boxes" aria-label="6-digit code">
                      {otpDigits.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => { otpRefs.current[i] = el }}
                          inputMode="numeric"
                          maxLength={1}
                          aria-label={`Digit ${i + 1}`}
                          className={digit ? 'filled' : ''}
                          value={digit}
                          onChange={(e) => updateOtpDigit(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          onPaste={handleOtpPaste}
                        />
                      ))}
                    </div>
                    <p className={`err${otpError ? ' show' : ''}`}>{otpError || "That code doesn't match. Check and try again."}</p>
                    <button className="btn" type="submit" disabled={loading}>
                      {loading ? (
                        <span className="btn-spinner" aria-label="Loading" />
                      ) : (
                        <>
                          Verify &amp; sign in
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </>
                      )}
                    </button>
                    <p className="resend">
                      Didn&apos;t get it?{' '}
                      <button type="button" disabled={resendIn > 0} onClick={handleResend}>
                        {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                      </button>
                    </p>
                  </form>
                )}
              </div>
            ) : (
              <div id="p-email" role="tabpanel" aria-labelledby="tab-email">
                <form onSubmit={handleLogin} noValidate>
                  <div className="field">
                    <label htmlFor="email">Email address</label>
                    <div className="control">
                      <span className="lead"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg></span>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        placeholder="you@groovia.co.in"
                        autoFocus
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
                      />
                    </div>
                    <p className={`err${emailError ? ' show' : ''}`}>{emailError || 'Enter a valid email address.'}</p>
                  </div>
                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <div className="control">
                      <span className="lead"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                      <input
                        id="password"
                        name="password"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setPasswordError('') }}
                      />
                      <button className="eye" type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}>
                        {showPw ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 4.4-1.1M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="m2 2 20 20" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                        )}
                      </button>
                    </div>
                    <p className={`err${passwordError ? ' show' : ''}`}>{passwordError || 'Enter your password.'}</p>
                  </div>
                  <div className="rowsplit">
                    <label className="check">
                      <input type="checkbox" defaultChecked />
                      <span className="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                      Remember me
                    </label>
                    <a className="link" href="#" onClick={(e) => e.preventDefault()}>Forgot password?</a>
                  </div>
                  <button className="btn" type="submit" disabled={loading}>
                    {loading ? (
                      <span className="btn-spinner" aria-label="Loading" />
                    ) : (
                      <>
                        Sign in
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            <p className="invite">Access by invitation only · <a href="mailto:admin@groovia.co.in">admin@groovia.co.in</a></p>
          </div>

          <div className="powered">Powered by <b>GrooVia</b></div>
        </section>
      </main>

      <div className={`toast${toast.show ? ' show' : ''}`} role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast.msg}</span>
      </div>
    </div>
  )
}
