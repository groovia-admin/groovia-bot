import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import ConversationsClient from '@/components/conversations/ConversationsClient'

export const dynamic = 'force-dynamic'

export default async function ConversationsPage() {
  // Owner-only: customer conversations carry more PII than most other
  // owner-visible screens, so this is deliberately narrower than the rest
  // of the owner-facing nav (which manager can mostly also reach).
  const context = await requireRole(['owner'])

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, color: '#94a3b8', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const { data: conversations, error } = await adminClient
    .from('whatsapp_conversations')
    .select('id, customer_phone, status, last_message_at, created_at, customers ( full_name )')
    .eq('shop_id', context.shopId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) {
    console.error('Failed to load conversations:', error)
  }

  const rows = (conversations ?? []).map((c) => {
    const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers
    return {
      id: c.id,
      customer_phone: c.customer_phone,
      customer_name: customer?.full_name ?? null,
      status: c.status,
      last_message_at: c.last_message_at,
      created_at: c.created_at,
    }
  })

  return <ConversationsClient initialConversations={rows} />
}
