import { randomUUID } from 'node:crypto'
// See the identical comment in api/shop/logo/route.ts — File type-checks
// as an ambient DOM global but isn't actually present as a bare global on
// Railway's Node 20 runtime, only via node:buffer.
import { File } from 'node:buffer'
import { NextResponse } from 'next/server'
import { requireShopRole, hasStaffPermission } from '@/lib/auth/require-shop-role'

const BUCKET = 'product-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// Identifies the actual image format from its file signature (magic
// bytes) rather than trusting the client-supplied Content-Type, which is
// trivially spoofable — a non-image (or HTML/SVG polyglot) could otherwise
// be uploaded with a .jpg extension into this public bucket.
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
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return 'image/webp'
  }

  return null
}

export async function POST(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  if (!hasStaffPermission(authorization, 'manage_products')) {
    return NextResponse.json(
      { error: "You don't have permission to manage products. Ask the shop owner to grant it." },
      { status: 403 }
    )
  }

  const { adminClient, shopId } = authorization

  // Reject an oversized upload from the Content-Length header before
  // request.formData() buffers the whole body into memory — the file.size
  // check below runs too late to prevent that buffering.
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BYTES + 2048) {
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 413 })
  }

  let formData: FormData

  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  }

  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
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

  // Path is namespaced by shop so one shop's uploads can never collide with
  // or overwrite another's, even though the bucket itself is public.
  const path = `${shopId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: sniffedType, upsert: false })

  if (uploadError) {
    console.error('Product image upload failed:', uploadError)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ url: data.publicUrl })
}
