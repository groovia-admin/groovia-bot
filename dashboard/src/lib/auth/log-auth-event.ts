// Best-effort — never throws, so a logging failure can't block the
// sign-in/sign-out flow around it. Returns a promise so logout can await
// it (call this BEFORE supabase.auth.signOut(), since signOut() clears the
// session cookie this route needs to identify who's logging out); login
// call sites are free to leave it un-awaited since ordering doesn't matter
// once the session already exists.
export function logAuthEvent(event: 'login' | 'logout', method?: string): Promise<void> {
  return fetch('/api/auth/log-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, method }),
  })
    .then(() => undefined)
    .catch(() => undefined)
}
