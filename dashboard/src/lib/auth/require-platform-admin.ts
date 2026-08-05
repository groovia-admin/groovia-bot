import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RequirePlatformAdminResult =
  | { error: NextResponse }
  | {
      adminClient: ReturnType<typeof createAdminClient>
      userId: string
      actorName: string
    }

/**
 * API-route guard for super-admin-only endpoints — verifies the caller has
 * a platform_admins row, never trusting a client-supplied role claim.
 */
export async function requirePlatformAdmin(): Promise<RequirePlatformAdminResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const adminClient = createAdminClient()

  const { data: adminRecord, error: adminError } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (adminError) {
    console.error('Platform admin verification failed:', adminError)
    return {
      error: NextResponse.json({ error: 'Unable to verify administrator access' }, { status: 500 }),
    }
  }

  if (!adminRecord) {
    return {
      error: NextResponse.json({ error: 'Only Super Admin users can manage shops' }, { status: 403 }),
    }
  }

  return {
    adminClient,
    userId: user.id,
    actorName: user.email ?? user.id,
  }
}
