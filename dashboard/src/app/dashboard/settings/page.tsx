import {
  Store, MapPin, QrCode, Bot, Ban, Truck, CreditCard, Send, Landmark,
} from 'lucide-react'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import EmptyState from '@/components/ui/EmptyState'
import ShopLogoUpload from '@/components/settings/ShopLogoUpload'
import ShopProfileForm from '@/components/settings/ShopProfileForm'
import BotBehaviorSettingsForm from '@/components/settings/BotBehaviorSettingsForm'
import DeliverySettingsForm from '@/components/settings/DeliverySettingsForm'
import DailySummarySettingsForm from '@/components/settings/DailySummarySettingsForm'
import PaymentSettingsForm from '@/components/settings/PaymentSettingsForm'
import ShopQrCode from '@/components/settings/ShopQrCode'
import DeclineReasonsSettingsForm from '@/components/settings/DeclineReasonsSettingsForm'

export const dynamic = 'force-dynamic'

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(11,28,48,0.04)' }
const eyebrowStyle: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 2px' }

function SettingsCard({
  icon: Icon,
  color,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType
  color: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon size={17} color={color} />
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', margin: '2px 0 0' }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

export default async function SettingsPage() {
  // Manager can reach this page (bot/store settings), but the payout &
  // banking section below is owner-only per the permission matrix.
  const context = await requireRole(['owner', 'manager'])
  const isOwner = context.kind === 'super_admin' || context.role === 'owner'

  let settings = null
  let shopSlug: string | null = null
  let whatsappNumber: string | null = null
  let shopProfile: {
    name: string
    description: string | null
    area: string | null
    address_line_1: string | null
    address_line_2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
  } | null = null

  if (context.kind === 'shop_user') {
    const adminClient = createAdminClient()

    const [{ data: settingsData, error: settingsError }, { data: shopData }, { data: connection }] = await Promise.all([
      adminClient
        .from('shop_settings')
        .select(
          'order_acceptance_enabled, allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, upi_id, accepted_payment_methods, auto_accept_orders, tax_enabled, tax_percentage, business_hours, welcome_message, away_message, reminder_enabled, auto_reject_after_minutes, daily_summary_enabled, daily_summary_time, order_decline_reasons'
        )
        .eq('shop_id', context.shopId)
        .maybeSingle(),
      adminClient
        .from('shops')
        .select('slug, name, description, area, address_line_1, address_line_2, city, state, postal_code')
        .eq('id', context.shopId)
        .maybeSingle(),
      adminClient.from('whatsapp_connections').select('display_phone_number').eq('shop_id', context.shopId).maybeSingle(),
    ])

    if (settingsError) {
      console.error('Failed to load shop settings:', settingsError)
    }

    settings = settingsData ?? null
    shopSlug = shopData?.slug ?? null
    whatsappNumber = connection?.display_phone_number ?? null
    shopProfile = shopData
      ? {
          name: shopData.name,
          description: shopData.description,
          area: shopData.area,
          address_line_1: shopData.address_line_1,
          address_line_2: shopData.address_line_2,
          city: shopData.city,
          state: shopData.state,
          postal_code: shopData.postal_code,
        }
      : null
  }

  // Super admins currently only get one real card here (Payout & Banking
  // is an honest "not built yet" placeholder) — a 2-column masonry with a
  // single card in it just leaves a huge empty column, which is exactly
  // the "lots of white space" problem. Give that view a single, narrower
  // column instead of forcing the multi-card shop-owner layout onto it.
  if (context.kind === 'super_admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink-muted)', marginTop: 4 }}>Platform-level configuration.</p>
        </div>
        <SettingsCard icon={Landmark} color="#64748b" title="Payout & Banking" subtitle="How shops get paid out from the platform.">
          <EmptyState
            icon={Landmark}
            title="Not built yet"
            description="There's no payout or banking configuration wired up on the platform side yet — this section is a placeholder for when that exists."
            compact
          />
        </SettingsCard>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink-muted)', marginTop: 4 }}>
          Your shop&apos;s identity, ordering rules, and how the WhatsApp bot behaves.
        </p>
      </div>

      {/* CSS multi-column instead of two independent flex columns — a fixed
          left/right split left the shorter side with a block of dead space
          under it whenever the two sides didn't happen to end up the same
          height. column-count balances total height between columns
          automatically; each card gets break-inside:avoid so it never
          splits across the column break. */}
      <div className="settings-columns" style={{ columnCount: 2, columnGap: 16 }}>
        {isOwner && (
          <div className="settings-block">
            <div style={eyebrowStyle}>Shop identity</div>
            <SettingsCard icon={Store} color="#a855f7" title="Shop Profile" subtitle="Your shop's logo, shown in the dashboard sidebar and to customers.">
              <ShopLogoUpload initialLogoUrl={context.shopLogoUrl} />
            </SettingsCard>
          </div>
        )}

        {isOwner && shopProfile && (
          <div className="settings-block">
            <SettingsCard icon={MapPin} color="#3b82f6" title="Shop Details" subtitle="Name, address, and phone shown to customers in the WhatsApp order link.">
              <ShopProfileForm initial={shopProfile} whatsappNumber={whatsappNumber} />
            </SettingsCard>
          </div>
        )}

        <div className="settings-block">
          <SettingsCard icon={QrCode} color="#f59e0b" title="Store QR Code" subtitle="Print or share this so customers can start ordering by scanning it.">
            <ShopQrCode slug={shopSlug} whatsappNumber={whatsappNumber} />
          </SettingsCard>
        </div>

        <div className="settings-block">
          <div style={eyebrowStyle}>Customer communication</div>
          <SettingsCard icon={Bot} color="#14b8a6" title="Bot Behavior" subtitle="Control what the WhatsApp bot says and how it handles new orders.">
            <BotBehaviorSettingsForm initial={settings} />
          </SettingsCard>
        </div>

        <div className="settings-block">
          <SettingsCard icon={Ban} color="#ef4444" title="Order Decline Reasons" subtitle="Quick-pick reasons offered when rejecting or cancelling an order.">
            <DeclineReasonsSettingsForm initial={settings?.order_decline_reasons ?? []} />
          </SettingsCard>
        </div>

        <div className="settings-block">
          <div style={eyebrowStyle}>Orders &amp; payments</div>
          <SettingsCard icon={Truck} color="#22c55e" title="Order & Delivery" subtitle="Pickup/delivery availability, fees, and tax.">
            <DeliverySettingsForm initial={settings} />
          </SettingsCard>
        </div>

        {isOwner && (
          <div className="settings-block">
            <SettingsCard icon={CreditCard} color="#6366f1" title="Payment" subtitle="UPI details and accepted payment methods.">
              <PaymentSettingsForm initial={settings} />
            </SettingsCard>
          </div>
        )}

        <div className="settings-block">
          <div style={eyebrowStyle}>Reporting</div>
          <SettingsCard icon={Send} color="#06b6d4" title="Daily Summary" subtitle="A morning WhatsApp recap of yesterday's orders, revenue, and top products.">
            <DailySummarySettingsForm initial={settings} />
          </SettingsCard>
        </div>
      </div>

      <style>{`
        .settings-block { break-inside: avoid; margin-bottom: 16px; }
        @media (max-width: 900px) {
          .settings-columns { column-count: 1 !important; }
        }
      `}</style>
    </div>
  );
}
