import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeIndianPhone } from '@/lib/phone'

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
  ownerPhone?: unknown
  owner_phone?: unknown
  description?: unknown
  postalCode?: unknown
  postal_code?: unknown
  area?: unknown
}

type UpdateShopBody = {
  is_active?: unknown
  subscription_status?: unknown
}

type ShopRouteContext = {
  params: Promise<{
    id: string
  }>
}

const SUBSCRIPTION_STATUSES = new Set([
  'trial',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'suspended',
])

function getText(value: unknown) {
  return typeof value === 'string'
    ? value.trim()
    : ''
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

  const {
    data: adminRecord,
    error: adminError,
  } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (adminError) {
    console.error(
      'Platform admin verification failed:',
      adminError
    )

    return {
      error: NextResponse.json(
        {
          error:
            'Unable to verify administrator access',
        },
        { status: 500 }
      ),
    }
  }

  if (!adminRecord) {
    return {
      error: NextResponse.json(
        {
          error:
            'Only Super Admin users can manage shops',
        },
        { status: 403 }
      ),
    }
  }

  return {
    adminClient,
  }
}

export async function GET() {
  const authorization =
    await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient } = authorization

  const {
    data: shops,
    error,
  } = await adminClient
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
    console.error(
      'Failed to load shops:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Failed to load shops',
      },
      {
        status: 500,
      }
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

export async function POST(
  request: Request
) {
  const authorization =
    await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient } = authorization

  let body: CreateShopBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid request body',
      },
      {
        status: 400,
      }
    )
  }

  const shopName =
    getText(body.shopName)

  const slug = getText(body.slug)
    .toLowerCase()
    .replace(/\s+/g, '-')

  const city =
    getText(body.city)

  const state =
    getText(body.state)

  const address =
    getText(body.address)

  const ownerName =
    getText(body.ownerName)

  const ownerEmail =
    getText(body.ownerEmail)
      .toLowerCase()

  const description =
    getText(body.description)

  const postalCode = getText(body.postalCode ?? body.postal_code)
  const area = getText(body.area)

  const rawOwnerPhone = getText(
    body.ownerPhone ??
    body.owner_phone
  )

  if (
    !shopName ||
    !slug ||
    !ownerName ||
    !ownerEmail ||
    !rawOwnerPhone
  ) {
    return NextResponse.json(
      {
        error:
          'Shop name, slug, owner name, owner email, and owner phone number are required',
      },
      {
        status: 400,
      }
    )
  }

  const ownerPhone =
    normalizeIndianPhone(
      rawOwnerPhone
    )

  if (!ownerPhone) {
    return NextResponse.json(
      {
        error:
          'Enter a valid 10-digit Indian mobile number',
      },
      {
        status: 400,
      }
    )
  }

  if (shopName.length > 150) {
    return NextResponse.json(
      {
        error:
          'Shop name must not exceed 150 characters',
      },
      {
        status: 400,
      }
    )
  }

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      {
        error:
          'Slug may contain only lowercase letters, numbers, and single hyphens',
      },
      {
        status: 400,
      }
    )
  }

  if (
    !EMAIL_REGEX.test(
      ownerEmail
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a valid owner email address',
      },
      {
        status: 400,
      }
    )
  }

  if (!/^\d{6}$/.test(postalCode)) {
  return NextResponse.json(
    {
      error:
        'Enter a valid 6-digit PIN code',
    },
    {
      status: 400,
    }
    )
  }

  const {
    data: existingShop,
    error: slugError,
  } = await adminClient
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
      {
        status: 500,
      }
    )
  }

  if (existingShop) {
    return NextResponse.json(
      {
        error:
          'This shop URL is already in use. Choose another slug.',
      },
      {
        status: 409,
      }
    )
  }

  let ownerId:
    | string
    | null = null

  let ownerCreated = false

  const {
    data: existingUsers,
    error: existingUserError,
  } =
    await adminClient
      .auth
      .admin
      .listUsers({
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
      {
        status: 500,
      }
    )
  }

  // Match by phone (the auth channel going forward) first, falling back
  // to email for accounts created before the phone-OTP switch.
  const existingOwner =
    existingUsers.users.find(
      user => user.phone === ownerPhone.replace('+', '')
    ) ??
    existingUsers.users.find(
      user => user.phone === ownerPhone
    ) ??
    existingUsers.users.find(
      user =>
        user.email
          ?.toLowerCase() ===
        ownerEmail
    ) ?? null

  if (existingOwner) {
    ownerId = existingOwner.id
  } else {
    const {
      data: createdUser,
      error: createUserError,
    } =
      await adminClient
        .auth
        .admin
        .createUser({
          email:
            ownerEmail,
          phone:
            ownerPhone,
          phone_confirm:
            true,
          user_metadata: {
            full_name:
              ownerName,
            phone_number:
              ownerPhone,
          },
        })

    if (
      createUserError ||
      !createdUser.user
    ) {
      return NextResponse.json(
        {
          error:
            createUserError
              ?.message ||
            'Failed to create the owner account',
        },
        {
          status: 400,
        }
      )
    }

    ownerId =
      createdUser.user.id

    ownerCreated =
      true
  }

  if (
    ownerId
  ) {
    const {
      error:
        ownerMetadataError,
    } =
      await adminClient
        .auth
        .admin
        .updateUserById(
          ownerId,
          {
            user_metadata: {
              full_name:
                ownerName,
              phone_number:
                ownerPhone,
            },
          }
        )

    if (
      ownerMetadataError
    ) {
      console.error(
        'Owner metadata update failed:',
        ownerMetadataError
      )
    }
  }

  const {
    data:
      createdShops,
    error:
      createShopError,
  } =
    await adminClient.rpc(
      'create_shop_with_owner',
      {
        p_name:
          shopName,
        p_slug:
          slug,
        p_city:
          city,
        p_state:
          state,
        p_address_line_1:
          address,
        p_owner_auth_user_id:
          ownerId,
        p_owner_full_name:
          ownerName,
        p_owner_phone:
          ownerPhone,
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

    if (
      ownerCreated &&
      ownerId
    ) {
      const {
        error:
          cleanupError,
      } =
        await adminClient
          .auth
          .admin
          .deleteUser(
            ownerId
          )

      if (
        cleanupError
      ) {
        console.error(
          'Owner cleanup failed:',
          cleanupError
        )
      }
    }

    return NextResponse.json(
      {
        error:
          createShopError
            ?.message ||
          'Failed to create the shop',
      },
      {
        status: 400,
      }
    )
  }

  const shop =
    createdShops[0]

  const shopUpdates: Record<string, string> = {}

  if (description) {
    shopUpdates.description = description
  }

  if (area) {
    shopUpdates.area = area
  }

  if (postalCode) {
    shopUpdates.postal_code = postalCode
  }

  if (Object.keys(shopUpdates).length > 0) {
    const { error: shopUpdateError } = await adminClient
      .from('shops')
      .update(shopUpdates)
      .eq('id', shop.id)

    if (shopUpdateError) {
      console.error('Shop metadata update failed:', shopUpdateError)
    }
  }

  // Belt-and-suspenders: ensure the owner's shop_users row carries their
  // phone number regardless of whether create_shop_with_owner already
  // sets it, since phone is now the owner's sign-in channel.
  const { error: ownerShopUserUpdateError } = await adminClient
    .from('shop_users')
    .update({ phone_number: ownerPhone })
    .eq('shop_id', shop.id)
    .eq('auth_user_id', ownerId)

  if (ownerShopUserUpdateError) {
    console.error('Owner shop_users phone update failed:', ownerShopUserUpdateError)
  }

  return NextResponse.json(
    {
      success:
        true,
      shop,
      owner: {
        id:
          ownerId,
        email:
          ownerEmail,
        phone:
          ownerPhone,
        created:
          ownerCreated,
      },
    },
    {
      status:
        201,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
      },
    }
  )
}

export async function PATCH(
  request: Request,
  {
    params,
  }: ShopRouteContext
) {
  const authorization =
    await requirePlatformAdmin()

  if (
    'error' in
    authorization
  ) {
    return authorization.error
  }

  let body:
    UpdateShopBody

  try {
    body =
      await request.json()
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid request body',
      },
      {
        status:
          400,
      }
    )
  }

  const changes: {
    is_active?:
      boolean
    subscription_status?:
      string
  } = {}

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'is_active'
      )
  ) {
    if (
      typeof body
        .is_active !==
      'boolean'
    ) {
      return NextResponse.json(
        {
          error:
            'is_active must be true or false',
        },
        {
          status:
            400,
        }
      )
    }

    changes.is_active =
      body.is_active
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'subscription_status'
      )
  ) {
    if (
      typeof body
        .subscription_status !==
        'string' ||
      !SUBSCRIPTION_STATUSES
        .has(
          body
            .subscription_status
        )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid subscription status',
        },
        {
          status:
            400,
        }
      )
    }

    changes
      .subscription_status =
      body
        .subscription_status
  }

  if (
    Object.keys(
      changes
    ).length === 0
  ) {
    return NextResponse.json(
      {
        error:
          'Provide is_active or subscription_status to update a shop',
      },
      {
        status:
          400,
      }
    )
  }

  const {
    id,
  } =
    await params

  const {
    data:
      shop,
    error,
  } =
    await authorization
      .adminClient
      .from(
        'shops'
      )
      .update(
        changes
      )
      .eq(
        'id',
        id
      )
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
      .maybeSingle()

  if (
    error
  ) {
    console.error(
      'Failed to update shop:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Failed to update the shop',
      },
      {
        status:
          500,
      }
    )
  }

  if (
    !shop
  ) {
    return NextResponse.json(
      {
        error:
          'Shop not found',
      },
      {
        status:
          404,
        }
      )
  }

  return NextResponse.json(
    {
      shop,
    },
    {
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
      },
    }
  )
}
