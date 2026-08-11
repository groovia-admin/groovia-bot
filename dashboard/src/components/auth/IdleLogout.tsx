"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAuthEvent } from "@/lib/auth/log-auth-event";
import { useToast } from "@/components/ui/ToastProvider";

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 30_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

// Auto-signs out after 15 minutes with no mouse/keyboard/touch activity
// anywhere in the dashboard. Tracked via a plain ref (not state) updated
// directly on each activity event — cheap, and avoids a re-render storm
// from mousemove. A periodic check (rather than one long-lived setTimeout
// reset on every event) is what actually compares elapsed time, so this
// still catches the timeout correctly even if the tab was backgrounded
// and its timers got throttled in the meantime.
export default function IdleLogout() {
  const router = useRouter();
  const toast = useToast();
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    const interval = setInterval(async () => {
      if (Date.now() - lastActivityRef.current < IDLE_LIMIT_MS) return;

      clearInterval(interval);
      const supabase = createClient();
      await logAuthEvent("logout", "idle_timeout");
      await supabase.auth.signOut();
      toast("Signed out due to inactivity");
      router.push("/login?reason=idle");
      router.refresh();
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      clearInterval(interval);
    };
  }, [router, toast]);

  return null;
}
