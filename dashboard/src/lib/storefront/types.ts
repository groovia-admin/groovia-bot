// Plain types only, no server-only imports — safe for both API routes
// and client components (StorefrontApp) to import.

export type CartItem = {
  product_id: string
  name: string
  unit: string
  unit_price: number
  quantity: number
  subtotal: number
}

export type CartSnapshot = {
  items: CartItem[]
  total: number
} | null

export type StorefrontProduct = {
  id: string
  category_id: string | null
  name: string
  description: string | null
  unit: string
  price: number
  image_url: string | null
}

export type StorefrontCategory = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  display_order: number
}

export type StorefrontSettings = {
  allow_pickup: boolean
  allow_delivery: boolean
  minimum_order_amount: number | null
  delivery_fee: number
  delivery_radius_km: number | null
  free_delivery_above: number | null
  accepted_payment_methods: string[] | null
  business_hours: Record<string, unknown> | null
  order_acceptance_enabled: boolean
} | null

export type DeliveryAddressInput = {
  label?: string
  address_line_1: string
  address_line_2?: string
  landmark?: string
  city?: string
  state?: string
  postal_code?: string
  latitude?: number
  longitude?: number
}

export type SubmitOrderBody = {
  orderType: 'pickup' | 'delivery'
  customerName: string
  paymentMethod: string
  pickupSlotLabel?: string
  deliveryAddress?: DeliveryAddressInput
}

export type SubmitOrderResult = { success: true; orderNumber: string } | { success: false; error: string }
