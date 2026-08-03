import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

const BUCKET = 'product-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

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

  const ext = ALLOWED_TYPES[file.type]

  if (!ext) {
    return NextResponse.json({ error: 'Only JPEG, PNG, or WebP images are allowed' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
  }

  // Path is namespaced by shop so one shop's uploads can never collide with
  // or overwrite another's, even though the bucket itself is public.
  const path = `${shopId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('Product image upload failed:', uploadError)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ url: data.publicUrl })
}
