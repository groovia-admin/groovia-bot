import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  const authorization = await requireShopRole(['owner'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id: conversationId } = await params

  // Scoped by shop_id so an owner can never read another shop's
  // conversation, even by guessing a UUID.
  const { data: conversation, error: conversationError } = await adminClient
    .from('whatsapp_conversations')
    .select('id, customer_phone')
    .eq('id', conversationId)
    .eq('shop_id', shopId)
    .maybeSingle()

  if (conversationError) {
    console.error('Conversation lookup failed:', conversationError)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // A logging-side race can split one customer's history across more than
  // one whatsapp_conversations row (see conversationLogger.js). Pull every
  // sibling row for this phone so the thread reads as one continuous
  // conversation regardless of which id the sidebar passed in.
  const { data: siblingConversations, error: siblingsError } = await adminClient
    .from('whatsapp_conversations')
    .select('id')
    .eq('shop_id', shopId)
    .eq('customer_phone', conversation.customer_phone)

  if (siblingsError) {
    console.error('Sibling conversation lookup failed:', siblingsError)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }

  const conversationIds = (siblingConversations ?? []).map((c) => c.id)

  const { data: messages, error } = await adminClient
    .from('whatsapp_messages')
    .select('id, direction, sender_type, message_type, content, sent_at')
    .in('conversation_id', conversationIds)
    .order('sent_at', { ascending: true })

  if (error) {
    console.error('Failed to load messages:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }

  return NextResponse.json(
    { messages: messages ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
