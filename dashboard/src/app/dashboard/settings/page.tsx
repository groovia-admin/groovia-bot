import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import ShopLogoUpload from '@/components/settings/ShopLogoUpload'
import BotBehaviorSettingsForm from '@/components/settings/BotBehaviorSettingsForm'
import DeliverySettingsForm from '@/components/settings/DeliverySettingsForm'
import PaymentSettingsForm from '@/components/settings/PaymentSettingsForm'
import ShopQrCode from '@/components/settings/ShopQrCode'

export const dynamic = 'force-dynamic'

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(17,27,33,0.04)' }
const cardTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#111B21', margin: '0 0 4px' }
const cardSubStyle: React.CSSProperties = { fontSize: 12, color: '#667781', margin: '0 0 16px' }

export default async function SettingsPage() {
  // Manager can reach this page (bot/store settings), but the payout &
  // banking section below is owner-only per the permission matrix.
  const context = await requireRole(['owner', 'manager'])
  const isOwner = context.kind === 'super_admin' || context.role === 'owner'

  let settings = null
  let shopSlug: string | null = null
  let whatsappNumber: string | null = null

  if (context.kind === 'shop_user') {
    const adminClient = createAdminClient()

    const [{ data: settingsData, error: settingsError }, { data: shopData }, { data: connection }] = await Promise.all([
      adminClient
        .from('shop_settings')
        .select(
          'order_acceptance_enabled, allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, upi_id, accepted_payment_methods, auto_accept_orders, tax_enabled, tax_percentage, business_hours, welcome_message, away_message, reminder_enabled, auto_reject_after_minutes'
        )
        .eq('shop_id', context.shopId)
        .maybeSingle(),
      adminClient.from('shops').select('slug').eq('id', context.shopId).maybeSingle(),
      adminClient.from('whatsapp_connections').select('display_phone_number').eq('shop_id', context.shopId).maybeSingle(),
    ])

    if (settingsError) {
      console.error('Failed to load shop settings:', settingsError)
    }

    settings = settingsData ?? null
    shopSlug = shopData?.slug ?? null
    whatsappNumber = connection?.display_phone_number ?? null
  }

  return (
    <div className="space-y-4">
      {context.kind === 'shop_user' && isOwner && (
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>Shop Profile</h2>
          <p style={cardSubStyle}>Your shop&apos;s logo, shown in the dashboard sidebar and to customers.</p>
          <ShopLogoUpload initialLogoUrl={context.shopLogoUrl} />
        </div>
      )}

      {context.kind === 'shop_user' && (
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>Store QR Code</h2>
          <p style={cardSubStyle}>Print or share this so customers can start ordering by scanning it.</p>
          <ShopQrCode slug={shopSlug} whatsappNumber={whatsappNumber} />
        </div>
      )}

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
        </>
      )}

      {isOwner && (
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>Payout &amp; Banking</h2>
          <p style={cardSubStyle}>Payout settings placeholder (owner only).</p>
        </div>
      )}
    </div>
  );
}
