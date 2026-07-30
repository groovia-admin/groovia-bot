import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  let createdShopId: string | null = null
  let createdAuthUserId: string | null = null

  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // 1. Verify current logged-in user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Verify platform admin
    const { data: adminRecord, error: adminError } =
      await adminClient
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (adminError) {
      console.error('Admin verification error:', adminError)

      return NextResponse.json(
        { error: adminError.message },
        { status: 500 }
      )
    }

    if (!adminRecord) {
      return NextResponse.json(
        { error: 'Only platform admins can create shops' },
        { status: 403 }
      )
    }

    // 3. Read request body
    const body = await request.json()

    const {
      shopName,
      slug,
      city,
      state,
      address,
      ownerName,
      ownerEmail,
    } = body

    if (!shopName || !slug || !ownerName || !ownerEmail) {
      return NextResponse.json(
        {
          error:
            'Shop name, slug, owner name, and owner email are required',
        },
        { status: 400 }
      )
    }

    // 4. Create Auth user
    const temporaryPassword = `GrooVia@${crypto
      .randomUUID()
      .slice(0, 8)}`

    const { data: authUser, error: authError } =
      await adminClient.auth.admin.createUser({
        email: ownerEmail.trim().toLowerCase(),
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: ownerName.trim(),
        },
      })

    if (authError || !authUser.user) {
      return NextResponse.json(
        {
          error:
            authError?.message ||
            'Failed to create owner account',
        },
        { status: 400 }
      )
    }

    createdAuthUserId = authUser.user.id

    // 5. Create shop
    const { data: shop, error: shopError } =
      await adminClient
        .from('shops')
        .insert({
          name: shopName.trim(),
          slug: slug.trim().toLowerCase(),
          city: city?.trim() || null,
          state: state?.trim() || null,
          address_line_1: address?.trim() || null,

          country: 'India',
          timezone: 'Asia/Kolkata',
          currency_code: 'INR',

          is_active: true,
          subscription_status: 'trial',
          shop_mode: 'live',
        })
        .select()
        .single()

    if (shopError || !shop) {
      await adminClient.auth.admin.deleteUser(
        createdAuthUserId
      )

      return NextResponse.json(
        {
          error:
            shopError?.message ||
            'Failed to create shop',
        },
        { status: 400 }
      )
    }

    createdShopId = shop.id

    // 6. Link owner to shop
    const { error: shopUserError } =
      await adminClient
        .from('shop_users')
        .insert({
          shop_id: shop.id,
          auth_user_id: createdAuthUserId,
          full_name: ownerName.trim(),
          role: 'owner',
          is_active: true,
        })

    if (shopUserError) {
      await adminClient
        .from('shops')
        .delete()
        .eq('id', createdShopId)

      await adminClient.auth.admin.deleteUser(
        createdAuthUserId
      )

      return NextResponse.json(
        {
          error: shopUserError.message,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      shop,
      owner: {
        id: createdAuthUserId,
        email: ownerEmail.trim().toLowerCase(),
        temporaryPassword,
      },
    })
  } catch (error) {
    console.error('Create shop error:', error)

    return NextResponse.json(
      {
        error: 'Unexpected server error',
      },
      { status: 500 }
    )
  }
}