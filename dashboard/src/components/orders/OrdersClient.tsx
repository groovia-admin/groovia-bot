"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Search, ShoppingBag, Check, X, RefreshCw, Download } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { useToast } from "@/components/ui/ToastProvider";
import { toCsv, downloadCsv } from "@/lib/csv";

// How often to silently re-fetch the order list in the background so a new
// WhatsApp order shows up without the staff member hitting refresh.
const AUTO_REFRESH_MS = 2 * 60 * 1000;

type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "completed" | "rejected" | "cancelled";

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  order_type: string;
  payment_method: string | null;
  payment_status: string;
  total_amount: number;
  pickup_slot_label: string | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
};

const STATUS_STYLE: Record<OrderStatus, [string, string]> = {
  pending: ["#B7791F", "rgba(245,158,11,0.12)"],
  accepted: ["#1D4ED8", "rgba(59,130,246,0.12)"],
  preparing: ["#6D28D9", "rgba(139,92,246,0.12)"],
  ready: ["#0F9D6B", "rgba(16,185,129,0.12)"],
  completed: ["#4B5563", "rgba(107,114,128,0.12)"],
  rejected: ["#C0392B", "rgba(239,68,68,0.12)"],
  cancelled: ["#C0392B", "rgba(239,68,68,0.12)"],
};

const STATUS_TABS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OrdersClient({
  initialOrders,
  showRevenue,
  canManage,
}: {
  initialOrders: OrderRow[];
  showRevenue: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const knownOrderIds = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));

  // Server re-fetches (initial load, or a manual/auto refresh below) land
  // here as a new `initialOrders` prop — reconcile local state against it
  // rather than replacing outright, so an optimistic update from
  // quickAccept isn't clobbered if it lands in the same tick as a refresh.
  useEffect(() => {
    const newOnes = initialOrders.filter((o) => !knownOrderIds.current.has(o.id));
    if (newOnes.length > 0 && knownOrderIds.current.size > 0) {
      toast(`${newOnes.length} new order${newOnes.length > 1 ? "s" : ""} came in`);
    }
    knownOrderIds.current = new Set(initialOrders.map((o) => o.id));
    setOrders(initialOrders);
    setLastRefreshedAt(new Date());
    setRefreshing(false);
    // toast identity is stable from context; only re-run when the server
    // actually gave us new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrders]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshing(true);
      router.refresh();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [router]);

  function manualRefresh() {
    setRefreshing(true);
    router.refresh();
  }

  function exportCsv() {
    const csv = toCsv(filtered, [
      { key: "order_number", label: "Order #" },
      { key: "status", label: "Status" },
      { key: "customer_name", label: "Customer name" },
      { key: "customer_phone", label: "Customer phone" },
      { key: "pickup_slot_label", label: "Pickup slot" },
      { key: "created_at", label: "Placed at" },
      ...(showRevenue ? [{ key: "total_amount" as const, label: "Total" }] : []),
    ]);
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const counts = useMemo(() => {
    const map: Partial<Record<OrderStatus, number>> = {};
    for (const o of orders) map[o.status] = (map[o.status] ?? 0) + 1;
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  async function quickAccept(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/shop/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error || "Failed to accept order", "error");
        return;
      }

      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "accepted" } : o)));
      toast("Order accepted");
    } catch {
      toast("Failed to accept order. Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111B21", margin: 0 }}>Orders</h1>
            <InfoTooltip
              items={[
                { color: "#B7791F", label: "Pending", hint: "awaiting shop response" },
                { color: "#1D4ED8", label: "Accepted", hint: "shop confirmed, not yet started" },
                { color: "#6D28D9", label: "Preparing", hint: "being packed" },
                { color: "#0F9D6B", label: "Ready", hint: "ready for pickup/delivery" },
                { color: "#4B5563", label: "Completed", hint: "handed over to customer" },
                { color: "#C0392B", label: "Rejected / Cancelled", hint: "order did not go through" },
              ]}
            />
          </div>
          <p style={{ fontSize: 13, color: "#667781", marginTop: 4 }}>Track order lifecycle and fulfillment.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Export the orders currently shown to a CSV file"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #E9EDEF",
              background: "#FFFFFF",
              color: "#667781",
              fontSize: 12,
              cursor: filtered.length === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: filtered.length === 0 ? 0.5 : 1,
            }}
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={manualRefresh}
            disabled={refreshing}
            title="Refresh now"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #E9EDEF",
              background: "#FFFFFF",
              color: "#667781",
              fontSize: 12,
              cursor: refreshing ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            <RefreshCw size={13} style={refreshing ? { animation: "spin 0.8s linear infinite" } : undefined} />
            Updated {formatDistanceToNowStrict(lastRefreshedAt, { addSuffix: true })}
          </button>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ position: "relative", maxWidth: 340 }}>
          <Search size={14} color="#8696A0" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer name or phone…"
            style={{ ...S.input, paddingLeft: 30 }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const count = tab.value === "all" ? orders.length : counts[tab.value] ?? 0;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: "1px solid " + (active ? "#25D366" : "#E9EDEF"),
                  background: active ? "#DCF8C6" : "#FFFFFF",
                  color: active ? "#128C7E" : "#667781",
                }}
              >
                {tab.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>Order</th>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Placed</th>
                {showRevenue && <th style={{ ...S.th, textAlign: "right" }}>Total</th>}
                <th style={{ ...S.th, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={showRevenue ? 6 : 5}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#667781" }}>
                      <ShoppingBag size={14} />
                      {orders.length === 0 ? "No orders yet." : "No orders match your search."}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const [color, background] = STATUS_STYLE[o.status];
                  const busy = busyId === o.id;
                  return (
                    <tr key={o.id}>
                      <td style={{ ...S.td, color: "#111B21", fontWeight: 500 }}>
                        <Link href={`/dashboard/orders/${o.id}`} style={{ color: "#128C7E", textDecoration: "none" }}>
                          #{o.order_number}
                        </Link>
                      </td>
                      <td style={S.td}>
                        {o.customer_name || o.customer_phone || "—"}
                      </td>
                      <td style={S.td}>
                        <span style={S.badge(color, background)}>{o.status}</span>
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                        {o.pickup_slot_label ?? format(new Date(o.created_at), "MMM d, HH:mm")}
                      </td>
                      {showRevenue && (
                        <td style={{ ...S.td, textAlign: "right", color: "#111B21", fontWeight: 600 }}>
                          ₹{Number(o.total_amount).toFixed(2)}
                        </td>
                      )}
                      <td style={{ ...S.td, textAlign: "right" }}>
                        {o.status === "pending" && canManage ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              disabled={busy}
                              title="Accept order"
                              onClick={() => quickAccept(o.id)}
                              style={{ ...S.btn("#25D366", "#fff"), padding: "6px 10px", opacity: busy ? 0.5 : 1 }}
                            >
                              <Check size={13} />
                            </button>
                            <Link
                              href={`/dashboard/orders/${o.id}`}
                              title="Reject order"
                              style={{ ...S.btn("rgba(239,68,68,0.12)", "#C0392B"), padding: "6px 10px", textDecoration: "none" }}
                            >
                              <X size={13} />
                            </Link>
                          </div>
                        ) : (
                          <Link href={`/dashboard/orders/${o.id}`} style={{ color: "#667781", fontSize: 12, textDecoration: "none" }}>
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
