"use client";

import { useEffect, useState } from "react";
import { X, FileText } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import OrderActions from "@/components/orders/OrderActions";
import OrderItemsEditor from "@/components/orders/OrderItemsEditor";
import { getOrderAgeMinutes, getAgingLevel, formatAgeShort, AGING_COLOR } from "@/lib/orderAging";
import type { OrderStatus } from "@/components/orders/OrderActions";

const STATUS_STYLE: Record<string, [string, string]> = {
  pending: ["#B7791F", "rgba(245,158,11,0.12)"],
  accepted: ["#1D4ED8", "rgba(59,130,246,0.12)"],
  preparing: ["#6D28D9", "rgba(139,92,246,0.12)"],
  ready: ["#0F9D6B", "rgba(16,185,129,0.12)"],
  completed: ["#4B5563", "rgba(107,114,128,0.12)"],
  rejected: ["var(--error)", "rgba(239,68,68,0.12)"],
  cancelled: ["var(--error)", "rgba(239,68,68,0.12)"],
};

const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: "created_at", label: "Placed" },
  { key: "accepted_at", label: "Accepted" },
  { key: "preparing_at", label: "Preparing" },
  { key: "ready_at", label: "Ready" },
  { key: "completed_at", label: "Completed" },
];

type OrderDetail = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_method: string | null;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  order_items: { id: string; product_name_snapshot: string; unit_snapshot: string; quantity: number; unit_price: number; subtotal: number }[];
  order_customer_details: { customer_name_snapshot: string | null; customer_phone_snapshot: string | null; delivery_address_snapshot: string | null } | { customer_name_snapshot: string | null; customer_phone_snapshot: string | null; delivery_address_snapshot: string | null }[] | null;
};

// Slide-over instead of navigating to /dashboard/orders/[id] — opening an
// order used to leave the list entirely (a full route change), which read
// as "opening in a new page" even though it was really just normal
// same-tab navigation. This keeps the list mounted underneath so closing
// the drawer returns to exactly where you were, no back-navigation needed.
// The standalone page route itself still exists for direct/shared links.
export default function OrderDetailDrawer({
  orderId,
  canManage,
  showRevenue,
  onClose,
}: {
  orderId: string | null;
  canManage: boolean;
  showRevenue: boolean;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [declineReasons, setDeclineReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/shop/orders/${id}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to load order");
        return;
      }
      setOrder(data.order);
      setDeclineReasons(data.declineReasons ?? []);
    } catch {
      setError("Failed to load order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (orderId) load(orderId);
    else setOrder(null);
  }, [orderId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (orderId) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [orderId, onClose]);

  if (!orderId) return null;

  const details = order
    ? Array.isArray(order.order_customer_details)
      ? order.order_customer_details[0]
      : order.order_customer_details
    : null;
  const items = order?.order_items ?? [];
  const [statusColor, statusBg] = order ? STATUS_STYLE[order.status] ?? STATUS_STYLE.pending : ["", ""];
  const isTerminalFail = order?.status === "rejected" || order?.status === "cancelled";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Order details"
      style={{ position: "fixed", inset: 0, background: "rgba(11,28,48,0.45)", zIndex: 100, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 640, height: "100%", background: "var(--surface)", overflowY: "auto", boxShadow: "-16px 0 40px -20px rgba(11,28,48,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: "sticky", top: 0, background: "#FFFFFF", borderBottom: "1px solid var(--surface-border)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--ink)" }}>
            {order ? `Order #${order.order_number}` : "Order details"}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", display: "flex", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {loading && !order && <div style={{ ...S.card }}>Loading…</div>}
          {error && <div style={{ color: "var(--error)", background: "var(--error-light)", border: "1px solid rgba(186,26,26,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "var(--text-base)" }}>{error}</div>}

          {order && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", margin: 0 }}>
                  {details?.customer_name_snapshot || details?.customer_phone_snapshot || "Unknown customer"}
                  {details?.customer_phone_snapshot && details?.customer_name_snapshot ? ` · ${details.customer_phone_snapshot}` : ""}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...S.badge(statusColor, statusBg), textTransform: "capitalize" }}>{order.status}</span>
                  {order.status === "pending" && (() => {
                    const minutes = getOrderAgeMinutes(order.created_at);
                    const level = getAgingLevel(minutes);
                    const { color, background } = AGING_COLOR[level];
                    return <span style={S.badge(color, background)}>Waiting {formatAgeShort(minutes)}</span>;
                  })()}
                  {order.status === "completed" && (
                    <a
                      href={`/api/shop/orders/${order.id}/invoice`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...S.btn("transparent", "var(--ink-muted)"), textDecoration: "none" }}
                    >
                      <FileText size={15} />
                      Invoice
                    </a>
                  )}
                </div>
              </div>

              {isTerminalFail && (order.rejection_reason || order.cancellation_reason) && (
                <div style={{ color: "var(--error)", background: "var(--error-light)", border: "1px solid rgba(186,26,26,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "var(--text-base)" }}>
                  {order.status === "rejected" ? "Rejection reason: " : "Cancellation reason: "}
                  {order.rejection_reason || order.cancellation_reason}
                </div>
              )}

              {canManage && (
                <OrderActions orderId={order.id} status={order.status} declineReasons={declineReasons} onChanged={() => load(order.id)} />
              )}

              {!isTerminalFail && (
                <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 0 }}>
                  {TIMELINE_STEPS.map((step, i) => {
                    const value = (order as unknown as Record<string, unknown>)[step.key] as string | null;
                    const reached = Boolean(value);
                    return (
                      <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i < TIMELINE_STEPS.length - 1 ? 1 : undefined }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 80 }}>
                          <div style={{ width: 12, height: 12, borderRadius: "50%", background: reached ? "var(--brand)" : "var(--surface-border)" }} />
                          <div style={{ fontSize: "var(--text-xs)", color: reached ? "var(--ink)" : "var(--ink-faint)", fontWeight: reached ? 600 : 400, textAlign: "center" }}>
                            {step.label}
                          </div>
                          {value && (
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>
                              {new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div style={{ flex: 1, height: 2, background: reached ? "var(--brand)" : "var(--surface-border)", margin: "0 4px 20px" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {order.status === "pending" && canManage ? (
                <OrderItemsEditor orderId={order.id} initialItems={items} showRevenue={showRevenue} />
              ) : (
                <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Item</th>
                        <th style={S.th}>Qty</th>
                        {showRevenue && <th style={S.th}>Unit price</th>}
                        {showRevenue && <th style={{ ...S.th, textAlign: "right" }}>Subtotal</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td style={S.td} colSpan={showRevenue ? 4 : 2}>No items recorded.</td>
                        </tr>
                      ) : (
                        items.map((item) => (
                          <tr key={item.id}>
                            <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{item.product_name_snapshot}</td>
                            <td style={S.td}>{item.quantity} {item.unit_snapshot}</td>
                            {showRevenue && <td style={S.td}>₹{Number(item.unit_price).toFixed(2)}</td>}
                            {showRevenue && <td style={{ ...S.td, textAlign: "right" }}>₹{Number(item.subtotal).toFixed(2)}</td>}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {showRevenue && (
                <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 6, maxWidth: 320, marginLeft: "auto" }}>
                  <Row label="Subtotal" value={order.subtotal} />
                  {order.delivery_fee > 0 && <Row label="Delivery fee" value={order.delivery_fee} />}
                  {order.tax_amount > 0 && <Row label="Tax" value={order.tax_amount} />}
                  {order.discount_amount > 0 && <Row label="Discount" value={-order.discount_amount} />}
                  <div style={{ borderTop: "1px solid var(--surface-border)", marginTop: 4, paddingTop: 6 }}>
                    <Row label="Total" value={order.total_amount} bold />
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", marginTop: 4 }}>
                    {order.payment_method ?? "Payment method not set"} · {order.payment_status}
                  </div>
                </div>
              )}

              {order.notes && (
                <div style={S.card}>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", fontWeight: 600, marginBottom: 4 }}>Order notes</div>
                  <div style={{ fontSize: "var(--text-base)", color: "var(--ink)" }}>{order.notes}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 400, color: "var(--ink)" }}>
      <span style={{ color: bold ? "var(--ink)" : "var(--ink-muted)" }}>{label}</span>
      <span>₹{Number(value).toFixed(2)}</span>
    </div>
  );
}
