import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type CreateShopBody = {
  shopName?: unknown
  slug?: unknown
  city?: unknown
  state?: unknown
  address?: unknown
  ownerName?: unknown
  ownerEmail?: unknown
}

function getText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function requirePlatformAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  const adminClient = createAdminClient()

  const { data: adminRecord, error: adminError } =
    await adminClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

  if (adminError) {
    console.error('Platform admin verification failed:', adminError)

    return {
      error: NextResponse.json(
        { error: 'Unable to verify administrator access' },
        { status: 500 }
      ),
    }
  }

  if (!adminRecord) {
    return {
      error: NextResponse.json(
        { error: 'Only Super Admin users can manage shops' },
        { status: 403 }
      ),
    }
  }

  return {
    adminClient,
  }
}

export async function GET() {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient } = authorization

  const { data: shops, error } = await adminClient
    .from('shops')
    .select(`
      id,
      slug,
      name,
      city,
      state,
      is_active,
      subscription_status,
      trial_ends_at,
      created_at,
      updated_at
    `)
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    console.error('Failed to load shops:', error)

    return NextResponse.json(
      { error: 'Failed to load shops' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      shops: shops ?? [],
    },
    {
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
      },
    }
  )
}

export async function POST(request: Request) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient } = authorization

  let body: CreateShopBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const shopName = getText(body.shopName)
  const slug = getText(body.slug)
    .toLowerCase()
    .replace(/\s+/g, '-')
  const city = getText(body.city)
  const state = getText(body.state)
  const address = getText(body.address)
  const ownerName = getText(body.ownerName)
  const ownerEmail = getText(body.ownerEmail)
    .toLowerCase()

  if (
    !shopName ||
    !slug ||
    !ownerName ||
    !ownerEmail
  ) {
    return NextResponse.json(
      {
        error:
          'Shop name, slug, owner name, and owner email are required',
      },
      { status: 400 }
    )
  }

  if (shopName.length > 150) {
    return NextResponse.json(
      {
        error:
          'Shop name must not exceed 150 characters',
      },
      { status: 400 }
    )
  }

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      {
        error:
          'Slug may contain only lowercase letters, numbers, and single hyphens',
      },
      { status: 400 }
    )
  }

  if (!EMAIL_REGEX.test(ownerEmail)) {
    return NextResponse.json(
      {
        error:
          'Enter a valid owner email address',
      },
      { status: 400 }
    )
  }

  /*
   * Check the slug before creating an Auth user.
   * This prevents orphan Auth users when a duplicate
   * shop slug is submitted.
   */
  const { data: existingShop, error: slugError } =
    await adminClient
      .from('shops')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

  if (slugError) {
    console.error(
      'Slug validation failed:',
      slugError
    )

    return NextResponse.json(
      {
        error:
          'Unable to validate the shop slug',
      },
      { status: 500 }
    )
  }

  if (existingShop) {
    return NextResponse.json(
      {
        error:
          'This shop URL is already in use. Choose another slug.',
      },
      { status: 409 }
    )
  }

  /*
   * Reuse an existing Auth account when the owner
   * already has one. This allows one owner to manage
   * multiple shops.
   */
  let ownerId: string | null = null
  let ownerCreated = false
  let temporaryPassword: string | null = null

  const {
    data: existingUsers,
    error: existingUserError,
  } =
    await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

  if (existingUserError) {
    console.error(
      'Owner lookup failed:',
      existingUserError
    )

    return NextResponse.json(
      {
        error:
          'Unable to validate the owner account',
      },
      { status: 500 }
    )
  }

  const existingOwner =
    existingUsers.users.find(
      user =>
        user.email?.toLowerCase() === ownerEmail
    ) ?? null

  if (existingOwner) {
    ownerId = existingOwner.id
  } else {
    temporaryPassword =
      `GrooVia@${crypto
        .randomUUID()
        .replace(/-/g, '')
        .slice(0, 12)}`

    const {
      data: createdUser,
      error: createUserError,
    } =
      await adminClient.auth.admin.createUser({
        email: ownerEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: ownerName,
        },
      })

    if (
      createUserError ||
      !createdUser.user
    ) {
      return NextResponse.json(
        {
          error:
            createUserError?.message ||
            'Failed to create the owner account',
        },
        { status: 400 }
      )
    }

    ownerId = createdUser.user.id
    ownerCreated = true
  }

  /*
   * The RPC inserts shops and shop_users inside
   * one PostgreSQL transaction.
   */
  const {
    data: createdShops,
    error: createShopError,
  } =
    await adminClient.rpc(
      'create_shop_with_owner',
      {
        p_name: shopName,
        p_slug: slug,
        p_city: city,
        p_state: state,
        p_address_line_1: address,
        p_owner_auth_user_id: ownerId,
        p_owner_full_name: ownerName,
      }
    )

  if (
    createShopError ||
    !createdShops ||
    createdShops.length !== 1
  ) {
    console.error(
      'Shop transaction failed:',
      createShopError
    )

    /*
     * Delete only an Auth user created by this request.
     * Never delete an existing owner account.
     */
    if (ownerCreated && ownerId) {
      const {
        error: cleanupError,
      } =
        await adminClient.auth.admin.deleteUser(
          ownerId
        )

      if (cleanupError) {
        console.error(
          'Owner cleanup failed:',
          cleanupError
        )
      }
    }

    return NextResponse.json(
      {
        error:
          createShopError?.message ||
          'Failed to create the shop',
      },
      { status: 400 }
    )
  }

  const shop = createdShops[0]

  return NextResponse.json(
    {
      success: true,
      shop,
      owner: {
        id: ownerId,
        email: ownerEmail,
        created: ownerCreated,
        temporaryPassword,
      },
    },
    {
      status: 201,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
      },
    }
  )
}