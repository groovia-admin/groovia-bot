import { createAdminClient } from '@/lib/supabase/admin'
import { validateEditLink } from '@/lib/orderEditLink'
import { StaffOrderEditApp } from '@/components/staff-edit/StaffOrderEditApp'

type StaffEditPageProps = {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ t?: string }>
}

// Deliberately outside /dashboard — no login, no sidebar, nothing but
// this one order. Opened straight from the WhatsApp "Edit" tap via a
// signed link (see lib/orderEditLink.ts + wa-bot's createEditLink) —
// the dashboard itself has no mobile layout and requires an OTP login,
// both wrong for a quick mid-chat edit.
export default async function StaffEditPage({ params, searchParams }: StaffEditPageProps) {
  const { orderId } = await params
  const { t: token } = await searchParams

  const adminClient = createAdminClient()
  const link = await validateEditLink(adminClient, orderId, token)

  if (!link) {
    return <ExpiredState />
  }

  const [{ data: order, error }, { data: connection }] = await Promise.all([
    adminClient
      .from('orders')
      .select(
        'id, order_number, status, subtotal, delivery_fee, tax_amount, discount_amount, total_amount, shops ( name ), order_items ( id, product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal )'
      )
      .eq('id', orderId)
      .eq('shop_id', link.shop_id)
      .maybeSingle(),
    adminClient.from('whatsapp_connections').select('display_phone_number').eq('shop_id', link.shop_id).maybeSingle(),
  ])

  if (error || !order) {
    return <ExpiredState message="This order couldn't be found." />
  }

  const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops
  const items = order.order_items ?? []
  const whatsappNumber = connection?.display_phone_number?.replace(/[^0-9]/g, '') || null

  // Editing a 'pending' order now auto-accepts it on the first change
  // (see the PATCH route) — so 'accepted' has to stay editable too,
  // otherwise that very first edit would immediately lock the page out
  // from any further changes.
  if (order.status !== 'pending' && order.status !== 'accepted') {
    return (
      <ExpiredState message={`Order ${order.order_number} can no longer be edited (already ${order.status}).`} />
    )
  }

  return (
    <StaffOrderEditApp
      orderId={order.id}
      orderNumber={order.order_number}
      shopName={shop?.name ?? 'Your shop'}
      token={token as string}
      initialItems={items}
      initialFees={{
        delivery_fee: order.delivery_fee,
        tax_amount: order.tax_amount,
        discount_amount: order.discount_amount,
      }}
      whatsappNumber={whatsappNumber}
    />
  )
}

function ExpiredState({ message }: { message?: string }) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#F8F9FF',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <p style={{ fontSize: 32, margin: '0 0 12px' }}>⚠️</p>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1C30', margin: '0 0 6px' }}>
          {message || 'This edit link has expired.'}
        </p>
        <p style={{ fontSize: 13, color: '#3D4947', margin: 0 }}>
          Ask the shop to tap Edit again from the order in WhatsApp.
        </p>
      </div>
    </main>
  )
}
