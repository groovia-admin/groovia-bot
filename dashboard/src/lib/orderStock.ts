import type { SupabaseClient } from '@supabase/supabase-js'

type StockDirection = 'decrement' | 'restore'

// Shared by every route that adjusts stock on an order status change:
// decrement on accept (items now committed as sold), restore on cancel
// (undoes that same commitment) — same RPC + inventory_movements
// pattern either way, just the sign and movement_type differ. Was
// three independently hand-copied ~25-line loops (this one plus the
// two call sites below) before a simplify-pass review caught it.
export async function adjustOrderStock(
  adminClient: SupabaseClient,
  {
    orderId,
    shopId,
    orderNumber,
    direction,
    createdBy = null,
  }: { orderId: string; shopId: string; orderNumber: string; direction: StockDirection; createdBy?: string | null }
) {
  const sign = direction === 'decrement' ? -1 : 1
  const movementType = direction === 'decrement' ? 'sale' : 'cancelled_order'

  const { data: items, error: itemsError } = await adminClient
    .from('order_items')
    .select('product_id, product_name_snapshot, quantity')
    .eq('order_id', orderId)

  if (itemsError) {
    console.error(`Failed to load order items for stock ${direction}:`, itemsError)
    return
  }

  for (const item of items ?? []) {
    if (!item.product_id) continue // custom/removed products have no stock to adjust

    const delta = sign * item.quantity
    const { error: rpcError } = await adminClient.rpc('adjust_product_stock', {
      p_product_id: item.product_id,
      p_delta: delta,
    })

    if (rpcError) {
      console.error(`Failed to ${direction} stock for product`, item.product_id, rpcError)
      continue
    }

    const { error: movementError } = await adminClient.from('inventory_movements').insert({
      shop_id: shopId,
      product_id: item.product_id,
      quantity_delta: delta,
      movement_type: movementType,
      reference_id: orderId,
      notes: `Order #${orderNumber} — ${item.product_name_snapshot}`,
      created_by: createdBy,
    })

    if (movementError) {
      console.error('Failed to record inventory movement:', movementError)
    }
  }
}
