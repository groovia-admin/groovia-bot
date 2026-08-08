// Timezone-aware day boundaries with no extra dependency — Node's built-in
// Intl API is enough to compute "midnight in this IANA timezone" without
// date-fns-tz/luxon. Needed because `new Date().toISOString().slice(0,10)`
// gives *UTC* midnight, not the shop's local midnight — for an IST shop
// that boundary is 5.5 hours off, so "today" silently includes part of
// yesterday and excludes the first chunk of the actual today.
export function startOfTodayUtc(timeZone: string): string {
  const now = new Date()

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const second = get('second')

  // Treating the timezone's current wall-clock reading as if it were UTC
  // gives an instant offset from the real `now` by exactly that timezone's
  // current UTC offset — no offset table needed.
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetMs = wallClockAsUtc - now.getTime()

  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0)
  return new Date(localMidnightAsUtc - offsetMs).toISOString()
}
