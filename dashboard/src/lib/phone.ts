const INDIA_PHONE_REGEX = /^[6-9]\d{9}$/

/**
 * Normalizes an Indian mobile number to +91XXXXXXXXXX.
 * Accepts bare 10-digit, +91-prefixed, or 91-prefixed input; strips
 * non-digit characters first. Returns null if the result isn't a valid
 * 10-digit Indian mobile number.
 */
export function normalizeIndianPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '')

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2)
  }

  if (!INDIA_PHONE_REGEX.test(digits)) {
    return null
  }

  return `+91${digits}`
}
