import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import WhatsappConnectionForm from '@/components/settings/WhatsappConnectionForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  // Manager can reach this page (bot/store settings), but the payout &
  // banking section below is owner-only per the permission matrix.
  const context = await requireRole(['owner', 'manager'])
  const isOwner = context.kind === 'super_admin' || context.role === 'owner'

  let connection = null

  if (context.kind === 'shop_user') {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('whatsapp_connections')
      .select('phone_number_id, business_account_id, display_phone_number, connection_status')
      .eq('shop_id', context.shopId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load WhatsApp connection:', error)
    }

    connection = data ?? null
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        Store settings placeholder.
      </div>

      {context.kind === 'shop_user' && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }}>WhatsApp Connection</h2>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
            Link your shop&apos;s WhatsApp Business number so staff and customers can message it.
          </p>
          <WhatsappConnectionForm initialConnection={connection} />
        </div>
      )}

      {isOwner && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Payout &amp; Banking</h2>
          <p className="text-sm text-slate-600">Payout settings placeholder (owner only).</p>
        </div>
      )}
    </div>
  );
}
