"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { ACTION_LABEL, ACTOR_BADGE, actorLabel, type ActorType } from "@/lib/auditLabels";

type NotificationRow = {
  id: string;
  actor_type: ActorType;
  action: string;
  entity_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const POLL_MS = 60_000;
const STORAGE_KEY = "groovia_notifications_last_seen";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastSeenAt(localStorage.getItem(STORAGE_KEY));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/shop/notifications");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      } catch {
        // Best-effort — the bell just shows nothing new until the next poll.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unreadCount = lastSeenAt === null ? notifications.length : notifications.filter((n) => n.created_at > lastSeenAt).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, now);
      setLastSeenAt(now);
    }
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={toggle}
        title="Recent activity"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 8,
          border: "1px solid #E9EDEF",
          background: "#FFFFFF",
          color: "#667781",
          cursor: "pointer",
        }}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: "#C0392B",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "#FFFFFF",
            border: "1px solid #E9EDEF",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(17,27,33,0.15)",
            zIndex: 50,
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #E9EDEF", fontSize: 13, fontWeight: 700, color: "#111B21" }}>
            Recent activity
          </div>
          {loading ? (
            <div style={{ padding: 20, fontSize: 13, color: "#8696A0", textAlign: "center" }}>Loading…</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: "#8696A0", textAlign: "center" }}>Nothing yet.</div>
          ) : (
            notifications.map((n) => {
              const [color] = ACTOR_BADGE[n.actor_type] ?? ACTOR_BADGE.system;
              const actorName = (n.metadata?.actor_name as string | undefined) ?? actorLabel(n.actor_type);
              const targetName = (n.metadata?.target_name as string | undefined) ?? n.entity_type;
              return (
                <div key={n.id} style={{ padding: "10px 14px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, marginTop: 6, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: "#111B21" }}>
                      <span style={{ fontWeight: 600 }}>{actorName}</span> {(ACTION_LABEL[n.action] ?? n.action).toLowerCase()}
                      {targetName ? ` — ${targetName}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#8696A0", marginTop: 2 }}>
                      {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <Link
            href="/dashboard/logs"
            onClick={() => setOpen(false)}
            style={{ display: "block", textAlign: "center", padding: "10px 14px", fontSize: 12, color: "#128C7E", textDecoration: "none", fontWeight: 600 }}
          >
            View all activity →
          </Link>
        </div>
      )}
    </div>
  );
}
