import type { SupabaseClient } from '@supabase/supabase-js'

// Checked before a shop can create a new product — returns the matched
// term (so the error message can say exactly why) or null if the name
// is clear. Case-insensitive substring match against the platform-wide
// restricted_product_terms list (super-admin managed only; see
// /dashboard/restricted-items). A shop's own product name is what gets
// checked, not brand/description — that's what the "keyword" list is
// actually meant to catch.
export async function findMatchingRestrictedTerm(adminClient: SupabaseClient, productName: string): Promise<string | null> {
  const { data: terms, error } = await adminClient.from('restricted_product_terms').select('term')

  if (error) {
    console.error('Failed to load restricted product terms:', error)
    return null // fail open — a lookup error shouldn't block every product creation platform-wide
  }

  const lowerName = productName.toLowerCase()
  const match = (terms ?? []).find((t) => lowerName.includes(t.term.toLowerCase()))
  return match?.term ?? null
}
