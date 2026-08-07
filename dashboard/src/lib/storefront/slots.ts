// Ports wa-bot/src/services/messageHandler.js's hourly pickup-slot
// generation to TypeScript for the webview's checkout step. Same
// duplication tradeoff as lib/orderSession.ts: wa-bot and this dashboard
// are separate deployments with no shared module, so this must be kept
// in sync by hand with the original if either ever changes. Deliberately
// today-only, same as the original — a shop open past midnight, or a
// customer checking out after closing for pickup tomorrow, isn't handled.

export type PickupSlot = { id: string; hour: number; label: string }

// List messages in wa-bot cap at 10 rows total; there's no such hard
// limit here (this renders as a plain list of buttons/rows in the
// webview), but kept the same for parity with what the native flow
// offers, and so a shop's business hours can't produce an unreasonably
// long list either place.
const MAX_PICKUP_SLOTS = 9

function getCurrentHourAndMinute(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())

  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24,
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
  }
}

function formatHourLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24
  const period = h < 12 ? 'AM' : 'PM'
  const displayHour = h % 12 === 0 ? 12 : h % 12
  return `${displayHour}:00 ${period}`
}

export function generateHourlySlots(
  businessHours: Record<string, unknown> | null | undefined,
  timezone: string
): PickupSlot[] {
  const open = businessHours?.open
  const close = businessHours?.close
  if (typeof open !== 'string' || typeof close !== 'string') return []

  const [openHour] = open.split(':').map(Number)
  const [closeHour] = close.split(':').map(Number)

  if (!Number.isInteger(openHour) || !Number.isInteger(closeHour) || closeHour <= openHour) {
    return []
  }

  const { hour: currentHour, minute: currentMinute } = getCurrentHourAndMinute(timezone)

  // The current hour's slot is already (partly) gone once we're inside
  // it — e.g. at 2:15pm the 2-3pm slot no longer makes sense to offer,
  // so the earliest option becomes 3-4pm.
  const nextFullHour = currentMinute > 0 ? currentHour + 1 : currentHour
  const startHour = Math.max(openHour, nextFullHour)

  const slots: PickupSlot[] = []
  for (let h = startHour; h < closeHour && slots.length < MAX_PICKUP_SLOTS; h++) {
    slots.push({ id: `slot_${h}`, hour: h, label: `${formatHourLabel(h)} – ${formatHourLabel(h + 1)}` })
  }

  return slots
}
