import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const FALLBACK_EMAIL = 'admin@groovia.co.in'

// Unauthenticated on purpose — the login page needs this before any
// session exists. Only ever returns the support email, nothing else on
// platform_settings is safe or useful to expose pre-auth.
export async function GET() {
  const adminClient = createAdminClient()

  const { data } = await adminClient
    .from('platform_settings')
    .select('support_email')
    .eq('id', true)
    .maybeSingle()

  return NextResponse.json(
    { email: data?.support_email || FALLBACK_EMAIL },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  )
}
