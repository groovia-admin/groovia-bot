"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ChefHat, PackageCheck, CircleCheckBig, Ban } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { S } from "@/lib/ui/dashboardStyles";

type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "completed" | "rejected" | "cancelled";

const NEXT_ACTIONS: Record<OrderStatus, { status: OrderStatus; label: string; icon: React.ElementType; bg: string; color: string; needsReason?: boolean }[]> = {
  pending: [
    { status: "accepted", label: "Accept order", icon: Check, bg: "var(--brand)", color: "#fff" },
    { status: "rejected", label: "Reject order", icon: X, bg: "rgba(239,68,68,0.12)", color: "var(--error)", needsReason: true },
  ],
  accepted: [
    { status: "preparing", label: "Start preparing", icon: ChefHat, bg: "var(--brand)", color: "#fff" },
    { status: "cancelled", label: "Cancel order", icon: Ban, bg: "rgba(239,68,68,0.12)", color: "var(--error)", needsReason: true },
  ],
  preparing: [
    { status: "ready", label: "Mark ready", icon: PackageCheck, bg: "var(--brand)", color: "#fff" },
    { status: "cancelled", label: "Cancel order", icon: Ban, bg: "rgba(239,68,68,0.12)", color: "var(--error)", needsReason: true },
  ],
  ready: [
    { status: "completed", label: "Mark completed", icon: CircleCheckBig, bg: "var(--brand)", color: "#fff" },
    { status: "cancelled", label: "Cancel order", icon: Ban, bg: "rgba(239,68,68,0.12)", color: "var(--error)", needsReason: true },
  ],
  completed: [],
  rejected: [],
  cancelled: [],
};

export default function OrderActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pendingReasonFor, setPendingReasonFor] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");

  const actions = NEXT_ACTIONS[status] ?? [];

  async function applyStatus(nextStatus: OrderStatus, reasonText?: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/shop/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason: reasonText }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error || "Failed to update order", "error");
        return;
      }

      toast(`Order marked ${nextStatus}`);
      setPendingReasonFor(null);
      setReason("");
      if (status === "pending") window.dispatchEvent(new Event("groovia:pending-orders-changed"));
      router.refresh();
    } catch {
      toast("Failed to update order. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0) return null;

  return (
    <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--ink)" }}>Update order</div>

      {pendingReasonFor ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={S.label}>
            Reason for marking this order {pendingReasonFor}
          </label>
          <textarea
            style={{ ...S.input, minHeight: 60, resize: "vertical" }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Out of stock, customer requested cancellation…"
            autoFocus
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => applyStatus(pendingReasonFor, reason.trim())}
              style={{ ...S.btn("var(--error)", "#fff"), opacity: busy || !reason.trim() ? 0.5 : 1 }}
            >
              Confirm {pendingReasonFor}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingReasonFor(null);
                setReason("");
              }}
              style={S.btn("var(--surface-hover)", "var(--ink)")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions.map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={busy}
              onClick={() => (action.needsReason ? setPendingReasonFor(action.status) : applyStatus(action.status))}
              style={{ ...S.btn(action.bg, action.color), opacity: busy ? 0.5 : 1 }}
            >
              <action.icon size={14} />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
