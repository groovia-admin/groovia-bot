"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ChefHat, PackageCheck, CircleCheckBig, Ban } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { S } from "@/lib/ui/dashboardStyles";
import OrderReasonModal from "./OrderReasonModal";

export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "completed" | "rejected" | "cancelled";

// Exported so the orders list page can offer the same transitions inline
// (a dropdown per row) without duplicating this table — the server route
// (api/shop/orders/[id]/route.ts) is still the actual source of truth/
// enforcement, this only drives which options make sense to show.
export const NEXT_ACTIONS: Record<OrderStatus, { status: OrderStatus; label: string; icon: React.ElementType; bg: string; color: string; needsReason?: boolean }[]> = {
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

export default function OrderActions({ orderId, status, declineReasons }: { orderId: string; status: OrderStatus; declineReasons: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pendingReasonFor, setPendingReasonFor] = useState<OrderStatus | null>(null);

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

      {pendingReasonFor && (
        <OrderReasonModal
          title={`Reason for marking this order ${pendingReasonFor}`}
          presetReasons={declineReasons}
          busy={busy}
          onCancel={() => setPendingReasonFor(null)}
          onConfirm={(reason) => applyStatus(pendingReasonFor, reason)}
        />
      )}
    </div>
  );
}
