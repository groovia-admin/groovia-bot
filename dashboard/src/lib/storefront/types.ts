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
