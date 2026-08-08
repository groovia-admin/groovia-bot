"use client";

import { useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

// A one-click version of Settings -> Bot Behavior -> "Accepting new
// orders" -> Save, surfaced on the page staff actually land on first.
// Same field, same API route — this doesn't introduce new state, it's
// just quick access to flip it without four clicks through Settings,
// matching how Swiggy/Zomato partner apps put this on the main screen
// rather than burying it.
export default function PauseOrdersToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    try {
      const response = await fetch("/api/shop/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_acceptance_enabled: next }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error || "Failed to update", "error");
        return;
      }

      setEnabled(next);
      toast(next ? "Now accepting orders" : "Orders paused — customers will see you're closed");
      router.refresh();
    } catch {
      toast("Failed to update. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (enabled) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title="Pause new orders"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid #B9EFA4",
          background: "#DCF8C6",
          color: "#128C7E",
          fontSize: 12,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          fontFamily: "inherit",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <PlayCircle size={13} />
        Accepting orders
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title="Resume accepting orders"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid #F5C6C2",
        background: "#FDECEA",
        color: "#C0392B",
        fontSize: 12,
        fontWeight: 700,
        cursor: busy ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <PauseCircle size={13} />
      Orders paused — tap to resume
    </button>
  );
}
