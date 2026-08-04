import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import WhatsappConnectionForm from '@/components/settings/WhatsappConnectionForm'
import BotBehaviorSettingsForm from '@/components/settings/BotBehaviorSettingsForm'
import DeliverySettingsForm from '@/components/settings/DeliverySettingsForm'
import PaymentSettingsForm from '@/components/settings/PaymentSettingsForm'

export const dynamic = 'force-dynamic'

const cardStyle: React.CSSProperties = { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20 }
const cardTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }
const cardSubStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', margin: '0 0 16px' }

export default async function SettingsPage() {
  // Manager can reach this page (bot/store settings), but the payout &
  // banking section below is owner-only per the permission matrix.
  const context = await requireRole(['owner', 'manager'])
  const isOwner = context.kind === 'super_admin' || context.role === 'owner'

  let connection = null
  let settings = null

  if (context.kind === 'shop_user') {
    const adminClient = createAdminClient()

    const [connectionResult, settingsResult] = await Promise.all([
      adminClient
        .from('whatsapp_connections')
        .select('phone_number_id, business_account_id, display_phone_number, catalog_id, connection_status')
        .eq('shop_id', context.shopId)
        .maybeSingle(),
      adminClient
        .from('shop_settings')
        .select(
          'order_acceptance_enabled, allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, upi_id, accepted_payment_methods, auto_accept_orders, tax_enabled, tax_percentage, business_hours, welcome_message, away_message'
        )
        .eq('shop_id', context.shopId)
        .maybeSingle(),
    ])

    if (connectionResult.error) {
      console.error('Failed to load WhatsApp connection:', connectionResult.error)
    }
    if (settingsResult.error) {
      console.error('Failed to load shop settings:', settingsResult.error)
    }

    connection = connectionResult.data ?? null
    settings = settingsResult.data ?? null
  }

  return (
    <div className="space-y-4">
      {context.kind === 'shop_user' && (
        <>
          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Bot Behavior</h2>
            <p style={cardSubStyle}>Control what the WhatsApp bot says and how it handles new orders.</p>
            <BotBehaviorSettingsForm initial={settings} />
          </div>

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Order &amp; Delivery</h2>
            <p style={cardSubStyle}>Pickup/delivery availability, fees, and tax.</p>
            <DeliverySettingsForm initial={settings} />
          </div>

          {isOwner && (
            <div style={cardStyle}>
              <h2 style={cardTitleStyle}>Payment</h2>
              <p style={cardSubStyle}>UPI details and accepted payment methods.</p>
              <PaymentSettingsForm initial={settings} />
            </div>
          )}

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>WhatsApp Connection</h2>
            <p style={cardSubStyle}>
              Link your shop&apos;s WhatsApp Business number so staff and customers can message it.
            </p>
            <WhatsappConnectionForm initialConnection={connection} />
          </div>
        </>
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
