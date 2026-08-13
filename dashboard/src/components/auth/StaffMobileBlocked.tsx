"use client";

import { createClient } from "@/lib/supabase/client";
import { logAuthEvent } from "@/lib/auth/log-auth-event";

export default function StaffMobileBlocked() {
  async function handleSignOut() {
    await logAuthEvent("logout");
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--surface)" }}>
      <div style={{ maxWidth: 380, textAlign: "center", background: "#FFFFFF", border: "1px solid var(--surface-border)", borderRadius: 16, padding: "32px 28px", boxShadow: "0 2px 12px rgba(11,28,48,0.06)" }}>
        <h1 style={{ fontSize: "var(--text-lg)", fontWeight: 800, color: "var(--ink)", margin: "0 0 8px" }}>
          Dashboard access is desktop-only for staff
        </h1>
        <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
          Staff accounts can&apos;t open the dashboard from a phone or tablet. Use a desktop or laptop browser, or continue
          handling orders through WhatsApp.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--surface-border)", background: "var(--surface)", color: "var(--ink)", fontSize: "var(--text-base)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
