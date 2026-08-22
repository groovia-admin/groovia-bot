"use client";

import { createClient } from "@/lib/supabase/client";
import { logAuthEvent } from "@/lib/auth/log-auth-event";

// `audience` covers two distinct callers: the baseline rule (staff are
// always blocked, this codebase's original behavior) vs. a shop that's
// opted into blocking everyone via block_mobile_dashboard_enabled (see
// FLAG_DEFINITIONS) — same screen, different copy, since "for staff"
// would be factually wrong shown to an owner/manager blocked by the
// shop-wide flag instead.
export default function StaffMobileBlocked({ audience = "staff" }: { audience?: "staff" | "shop" }) {
  async function handleSignOut() {
    await logAuthEvent("logout");
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--surface)" }}>
      <div style={{ maxWidth: 380, textAlign: "center", background: "#FFFFFF", border: "1px solid var(--surface-border)", borderRadius: 16, padding: "32px 28px", boxShadow: "0 2px 12px rgba(11,28,48,0.06)" }}>
        <h1 style={{ fontSize: "var(--text-lg)", fontWeight: 800, color: "var(--ink)", margin: "0 0 8px" }}>
          {audience === "staff" ? "Dashboard access is desktop-only for staff" : "Dashboard access is desktop-only for this shop"}
        </h1>
        <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
          {audience === "staff"
            ? "Staff accounts can’t open the dashboard from a phone or tablet. Use a desktop or laptop browser, or continue handling orders through WhatsApp."
            : "This shop has mobile dashboard access turned off for everyone. Use a desktop or laptop browser, or continue handling orders through WhatsApp."}
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
