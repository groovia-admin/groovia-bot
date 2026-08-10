"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

const POLL_MS = 30_000;

// Two-tone chime synthesized on the fly — no audio asset to bundle/host,
// and it only ever runs after a real user gesture (the "Enable alerts"
// click, or any click at all — see armAudio below), so browsers won't
// block it as unsolicited autoplay.
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });

    setTimeout(() => ctx.close(), 900);
  } catch {
    // Web Audio unsupported/blocked — the toast + browser notification
    // below still carry the alert, sound is a bonus, not load-bearing.
  }
}

export default function OrderAlertListener() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const lastSeenOrderId = useRef<string | null>(null);
  const initialized = useRef(false);
  const audioArmed = useRef(false);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);

    // Web Audio requires a user gesture to actually produce sound in most
    // browsers — this arms it on the very first click/tap anywhere in the
    // dashboard, well before the first real alert is likely to fire.
    function arm() {
      audioArmed.current = true;
      window.removeEventListener("pointerdown", arm);
    }
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/shop/orders/pending-summary");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const latestId = data.latest?.id ?? null;

        if (!initialized.current) {
          // First poll after mount just establishes the baseline — an
          // order that was already pending before this tab opened
          // shouldn't ding as if it just arrived.
          initialized.current = true;
          lastSeenOrderId.current = latestId;
          return;
        }

        if (latestId && latestId !== lastSeenOrderId.current) {
          lastSeenOrderId.current = latestId;
          const orderNumber = data.latest?.order_number as string | undefined;

          if (audioArmed.current) playChime();
          toast(orderNumber ? `New order — #${orderNumber}` : "New order received");

          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            const notification = new Notification("New GrooVia order", {
              body: orderNumber ? `Order #${orderNumber} is waiting for you.` : "A new order is waiting for you.",
              tag: "groovia-new-order",
            });
            // Browsers otherwise leave this up to the OS (anywhere from a
            // few seconds to indefinite) — force it shut after 3s so it
            // matches the in-app toast's lifetime instead of lingering.
            setTimeout(() => notification.close(), 3000);
          }

          // Nudges the sidebar's Orders badge to refetch its count right
          // away rather than waiting for its own independent poll cycle.
          window.dispatchEvent(new Event("groovia:pending-orders-changed"));

          // Only the Orders page holds live order state to refresh —
          // everywhere else the toast alone is enough, a background
          // refresh elsewhere would just be wasted work.
          if (pathname?.startsWith("/dashboard/orders")) router.refresh();
        }
      } catch {
        // Best-effort — a missed poll just means the next one 30s later
        // catches up, never worth surfacing as an error to the user.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    audioArmed.current = true;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") toast("Order alerts enabled");
  }

  if (permission === "unsupported" || permission === "granted") return null;

  return (
    <button
      type="button"
      onClick={requestPermission}
      title="Get a sound + browser notification when a new order arrives, even on another tab"
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 40,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid var(--surface-border)",
        background: "#FFFFFF",
        color: "var(--ink-muted)",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(11,28,48,0.08)",
      }}
    >
      {permission === "denied" ? <BellOff size={13} /> : <Bell size={13} />}
      {permission === "denied" ? "Order alerts blocked" : "Enable order alerts"}
    </button>
  );
}
