import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'
import { logAuditEvent } from '@/lib/audit/log'

const BUCKET = 'shop-logos'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// Same magic-byte sniff as the product-image upload route — never trust
// the client-supplied Content-Type for a file landing in a public bucket.
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

export async function POST(request: Request) {
  try {
    return await handleUpload(request)
  } catch (err) {
    // Every individual step here (auth, storage upload, shops update,
    // audit log) has been verified working in isolation against the same
    // database — this catch exists specifically to capture whatever is
    // different about the real request path if it fails again.
    console.error('Unhandled error in POST /api/shop/logo:', err instanceof Error ? err.stack || err.message : err)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }
}

async function handleUpload(request: Request) {
  // Branding is an owner-level decision, unlike product photos which any
  // active staff member can manage day-to-day.
  const authorization = await requireShopRole(['owner'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId, userId, actorName, role } = authorization

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BYTES + 2048) {
    return NextResponse.json({ error: 'Logo must be under 5MB' }, { status: 413 })
  }

  let formData: FormData

  try {
    formData = await request.formData()
  } catch (err) {
    console.error('Failed to parse logo upload form data:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  }

  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo must be under 5MB' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffedType = sniffImageType(bytes)
  const ext = sniffedType ? ALLOWED_EXTENSIONS[sniffedType] : undefined

  if (!sniffedType || !ext) {
    return NextResponse.json(
      { error: 'File content is not a valid JPEG, PNG, or WebP image' },
      { status: 400 }
    )
  }

  const path = `${shopId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: sniffedType, upsert: false })

  if (uploadError) {
    console.error('Logo upload failed:', uploadError)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }

  const { data: publicUrlData } = adminClient.storage.from(BUCKET).getPublicUrl(path)

  const { data: shop, error: updateError } = await adminClient
    .from('shops')
    .update({ logo_url: publicUrlData.publicUrl })
    .eq('id', shopId)
    .select('id, logo_url')
    .single()

  if (updateError) {
    console.error('Failed to save logo URL:', updateError)
    return NextResponse.json({ error: 'Failed to save logo' }, { status: 500 })
  }

  await logAuditEvent({
    shopId,
    actorUserId: userId,
    actorType: role,
    action: 'shop.logo_updated',
    entityType: 'shop',
    entityId: shopId,
    newValues: { logo_url: shop.logo_url },
    metadata: { actor_name: actorName },
  })

  return NextResponse.json({ logo_url: shop.logo_url })
}
