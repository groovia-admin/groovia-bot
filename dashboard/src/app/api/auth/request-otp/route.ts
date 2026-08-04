import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeIndianPhone } from '@/lib/phone'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

// The login page previously called supabase.auth.signInWithOtp() directly
// from the browser, with no rate limiting beyond Supabase's own defaults —
// nothing stopped repeatedly spamming SMS sends to any phone number. This
// route wraps that call with an app-level limit (5 sends per 15 minutes
// per phone), enforced via a small DB-backed counter since Next.js API
// routes have no reliable persistent in-memory state to count against.
export async function POST(request: Request) {
  let body: { phone?: unknown }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const phone = normalizeIndianPhone(typeof body.phone === 'string' ? body.phone : '')

  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: existing, error: lookupError } = await adminClient
    .from('otp_rate_limits')
    .select('attempt_count, window_started_at')
    .eq('phone', phone)
    .maybeSingle()

  if (lookupError) {
    console.error('OTP rate limit lookup failed:', lookupError)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  const now = Date.now()
  const withinWindow = Boolean(
    existing && now - new Date(existing.window_started_at).getTime() < WINDOW_MS
  )

  if (withinWindow && existing!.attempt_count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again in a few minutes.' },
      { status: 429 }
    )
  }

  const { error: upsertError } = await adminClient.from('otp_rate_limits').upsert(
    {
      phone,
      attempt_count: withinWindow ? existing!.attempt_count + 1 : 1,
      window_started_at: withinWindow ? existing!.window_started_at : new Date().toISOString(),
    },
    { onConflict: 'phone' }
  )

  if (upsertError) {
    console.error('OTP rate limit update failed:', upsertError)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // A plain (non-admin) client is enough here — sending an OTP doesn't
  // require the service role, just the same public anon key the browser
  // client already used before this route existed.
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // shouldCreateUser: false — staff/manager accounts are provisioned in
  // advance by the shop owner, so an unrecognized phone must not be able
  // to self-register just by requesting an OTP.
  const { error } = await anonClient.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  })

  if (error) {
    return NextResponse.json(
      { error: 'Phone not recognized. Contact your shop owner to be added as staff.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
