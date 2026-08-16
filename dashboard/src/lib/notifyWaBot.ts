// Shared "POST to wa-bot's internal API, log on failure, never throw"
// helper — the staff-edit routes (done, cancel) each independently
// re-implemented this fetch+log boilerplate 2-3 times per file before a
// simplify-pass review caught the duplication. Deliberately not
// awaited by callers (fire-and-forget): none of these notifications may
// block or fail the request that triggered them, since the underlying
// order mutation has already succeeded by the time this is called.
export function notifyWaBot(base: string, internalSecret: string, path: string, body: unknown, label: string) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) console.error(`wa-bot rejected ${label}:`, res.status, await res.text().catch(() => ''))
    })
    .catch((err) => console.error(`Failed to reach wa-bot for ${label}:`, err))
}
