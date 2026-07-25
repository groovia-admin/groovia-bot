export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended'
export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'rejected' | 'cancelled'
export type PaymentMethod = 'cash' | 'upi' | 'online' | 'pay_later'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type ShopRole = 'owner' | 'manager' | 'staff'
export type ActorType = 'super_admin' | 'owner' | 'manager' | 'staff' | 'system' | 'whatsapp' | 'ai'

export interface Shop {
  id: string
  slug: string
  name: string
  description: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  owner_phone: string | null
  is_active: boolean
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  shop_id: string
  category_id: string | null
  name: string
  description: string | null
  unit: string
  price: number
  cost_price: number | null
  stock_qty: number
  low_stock_threshold: number
  is_available: boolean
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  order_number: string
  shop_id: string
  status: OrderStatus
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  subtotal: number
  discount_amount: number
  total_amount: number
  preferred_pickup_time: string | null
  pickup_slot_label: string | null
  notes: string | null
  created_via: string
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  phone: string
  name: string | null
  email: string | null
  created_at: string
  updated_at: string
}

export interface ShopUser {
  id: string
  shop_id: string
  user_id: string | null
  full_name: string
  phone: string
  role: ShopRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
}