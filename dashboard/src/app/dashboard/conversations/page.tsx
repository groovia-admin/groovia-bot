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
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: 13 }}>Not applicable for super admins.</div>
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

  // A logging-side race can create more than one whatsapp_conversations row
  // for the same customer phone; collapse them into one sidebar entry here
  // rather than showing the same customer twice. The messages API resolves
  // every sibling row for the phone regardless of which id is passed to it.
  const mergedByPhone = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const existing = mergedByPhone.get(row.customer_phone)
    if (!existing) {
      mergedByPhone.set(row.customer_phone, row)
      continue
    }
    const rowTime = row.last_message_at ?? row.created_at
    const existingTime = existing.last_message_at ?? existing.created_at
    const newer = rowTime > existingTime ? row : existing
    mergedByPhone.set(row.customer_phone, {
      ...newer,
      customer_name: existing.customer_name ?? row.customer_name,
      last_message_at: [row.last_message_at, existing.last_message_at].filter(Boolean).sort().pop() ?? null,
    })
  }
  const mergedRows = Array.from(mergedByPhone.values()).sort((a, b) => {
    const aTime = a.last_message_at ?? a.created_at
    const bTime = b.last_message_at ?? b.created_at
    return bTime.localeCompare(aTime)
  })

  return <ConversationsClient initialConversations={mergedRows} />
}
