// Auto-aligned with actual Supabase schema - July 2026

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended'
export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'rejected' | 'cancelled'
export type OrderType = 'pickup' | 'delivery'
export type PaymentMethod = 'cash' | 'upi' | 'online' | 'pay_later'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type ShopRole = 'owner' | 'manager' | 'staff'
export type ActorType = 'super_admin' | 'owner' | 'manager' | 'staff' | 'system' | 'whatsapp' | 'ai'
export type MovementType = 'initial_stock' | 'sale' | 'restock' | 'manual_adjustment' | 'damaged' | 'returned' | 'cancelled_order'

// ── shops ─────────────────────────────────────────────────────────────────────
export interface Shop {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  area: string | null
  phone_number: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  latitude: number | null
  longitude: number | null
  timezone: string
  currency_code: string
  is_active: boolean
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  created_at: string
  updated_at: string
  // Note: NO owner_phone on shops — owner phone lives in shop_users
}

// ── shop_users ────────────────────────────────────────────────────────────────
export interface ShopUser {
  id: string
  shop_id: string
  auth_user_id: string        // Required FK to auth.users.id; column is auth_user_id, NOT user_id
  full_name: string
  role: ShopRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// ── products ──────────────────────────────────────────────────────────────────
export interface Product {
  id: string
  shop_id: string
  category_id: string | null
  name: string
  description: string | null
  unit: string
  price: number
  cost_price: number | null
  stock_quantity: number        // NOTE: column is stock_quantity, NOT stock_qty
  low_stock_threshold: number
  reorder_threshold: number | null
  is_available: boolean
  image_url: string | null
  sku: string | null
  last_updated_source: string | null
  last_updated_by: string | null
  created_at: string
  updated_at: string
}

// ── categories ────────────────────────────────────────────────────────────────
export interface Category {
  id: string
  shop_id: string
  name: string
  description: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── orders ────────────────────────────────────────────────────────────────────
export interface Order {
  id: string
  order_number: string
  shop_id: string
  customer_id: string | null
  status: OrderStatus
  order_type: OrderType
  payment_method: PaymentMethod | null
  payment_status: PaymentStatus
  subtotal: number
  delivery_fee: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  preferred_pickup_time: string | null
  pickup_slot_label: string | null
  delivery_address_id: string | null
  delivery_distance_km: number | null
  notes: string | null
  created_via: string
  last_updated_via: string | null
  accepted_at: string | null
  preparing_at: string | null
  ready_at: string | null
  completed_at: string | null
  rejected_at: string | null
  cancelled_at: string | null
  rejection_reason: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

// ── order_items ───────────────────────────────────────────────────────────────
export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name_snapshot: string
  unit_snapshot: string
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
}

// ── order_customer_details ────────────────────────────────────────────────────
export interface OrderCustomerDetails {
  order_id: string
  customer_id: string | null
  customer_name_snapshot: string | null
  customer_phone_snapshot: string | null
  delivery_address_snapshot: Record<string, unknown> | null
  created_at: string
}

// ── customers ─────────────────────────────────────────────────────────────────
export interface Customer {
  id: string
  shop_id: string
  phone: string
  full_name: string | null
  email: string | null
  total_orders: number
  total_spent: number
  outstanding_credit: number
  last_order_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── customer_addresses ────────────────────────────────────────────────────────
export interface CustomerAddress {
  id: string
  customer_id: string
  label: string | null
  address_line_1: string
  address_line_2: string | null
  landmark: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  is_default: boolean
  created_at: string
  updated_at: string
}

// ── inventory_movements ───────────────────────────────────────────────────────
export interface InventoryMovement {
  id: string
  shop_id: string
  product_id: string
  quantity_delta: number
  movement_type: MovementType
  reference_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

// ── audit_logs ────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string
  shop_id: string | null
  actor_user_id: string | null
  actor_type: ActorType
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
}

// ── shop_settings ─────────────────────────────────────────────────────────────
export interface ShopSettings {
  shop_id: string
  order_acceptance_enabled: boolean
  allow_pickup: boolean
  allow_delivery: boolean
  minimum_order_amount: number | null
  delivery_fee: number
  delivery_radius_km: number | null
  free_delivery_above: number | null
  upi_id: string | null
  accepted_payment_methods: string[] | null
  auto_accept_orders: boolean
  tax_enabled: boolean
  tax_percentage: number | null
  business_hours: Record<string, unknown>
  welcome_message: string | null
  away_message: string | null
  created_at: string
  updated_at: string
}

// ── whatsapp_connections ──────────────────────────────────────────────────────
export interface WhatsappConnection {
  id: string
  shop_id: string
  phone_number_id: string
  business_account_id: string | null
  display_phone_number: string | null
  connection_status: string
  connected_at: string | null
  created_at: string
  updated_at: string
}

// ── platform_admins ───────────────────────────────────────────────────────────
export interface PlatformAdmin {
  user_id: string
  created_at: string
}