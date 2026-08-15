"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Search, ShoppingBag, Check, RefreshCw, Download } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import InfoTooltip from "@/components/ui/InfoTooltip";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { toCsv, downloadCsv } from "@/lib/csv";
import OrderAgeBadge from "@/components/orders/OrderAgeBadge";
import { getAgingLevel, getOrderAgeMinutes } from "@/lib/orderAging";
import { NEXT_ACTIONS, type OrderStatus } from "@/components/orders/OrderActions";
import OrderReasonModal from "@/components/orders/OrderReasonModal";

// How often to silently re-fetch the order list in the background so a new
// WhatsApp order shows up without the staff member hitting refresh.
const AUTO_REFRESH_MS = 2 * 60 * 1000;

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
  item_count: number;
};

const STATUS_STYLE: Record<OrderStatus, [string, string]> = {
  pending: ["#B7791F", "rgba(245,158,11,0.12)"],
  accepted: ["#1D4ED8", "rgba(59,130,246,0.12)"],
  preparing: ["#6D28D9", "rgba(139,92,246,0.12)"],
  ready: ["#0F9D6B", "rgba(16,185,129,0.12)"],
  completed: ["#4B5563", "rgba(107,114,128,0.12)"],
  rejected: ["var(--error)", "rgba(239,68,68,0.12)"],
  cancelled: ["var(--error)", "rgba(239,68,68,0.12)"],
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
  declineReasons,
}: {
  initialOrders: OrderRow[];
  showRevenue: boolean;
  canManage: boolean;
  declineReasons: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<{ orderId: string; orderNumber: string; nextStatus: OrderStatus } | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const knownOrderIds = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));

  // Ticks every 30s so pending-order age badges age visibly without
  // needing a real data refetch — one shared timer for the whole table.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

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
      { key: "item_count", label: "Items" },
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

      const rowDate = o.created_at.slice(0, 10);
      if (dateFrom && rowDate < dateFrom) return false;
      if (dateTo && rowDate > dateTo) return false;

      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, dateFrom, dateTo]);

  // Bulk actions only ever apply to pending orders — accepting is the only
  // status change safe to fire off in a batch without per-order context
  // (reject/cancel require a reason, which doesn't make sense to type once
  // for N different orders).
  const selectablePendingIds = useMemo(() => filtered.filter((o) => o.status === "pending").map((o) => o.id), [filtered]);
  const allSelectableSelected = selectablePendingIds.length > 0 && selectablePendingIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSelectableSelected) return new Set();
      return new Set(selectablePendingIds);
    });
  }

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
      window.dispatchEvent(new Event("groovia:pending-orders-changed"));
    } catch {
      toast("Failed to accept order. Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  }

  // Inline status change from the list row's dropdown — same endpoint and
  // transition rules OrderActions.tsx uses on the detail page (NEXT_ACTIONS
  // is shared from there), just without navigating away first.
  async function applyStatus(id: string, nextStatus: OrderStatus, reason?: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/shop/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error || "Failed to update order", "error");
        return;
      }

      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: nextStatus } : o)));
      toast(`Order marked ${nextStatus}`);
      setReasonPrompt(null);
      window.dispatchEvent(new Event("groovia:pending-orders-changed"));
    } catch {
      toast("Failed to update order. Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  }

  // Reason-required transitions (reject/cancel) open the shared modal
  // in-place instead of navigating to the order detail page — that
  // navigation was the "opens somewhere else" complaint, even though it
  // was technically the same tab.
  function requestStatus(order: OrderRow, nextStatus: OrderStatus, needsReason?: boolean) {
    if (needsReason) {
      setReasonPrompt({ orderId: order.id, orderNumber: order.order_number, nextStatus });
      return;
    }
    applyStatus(order.id, nextStatus);
  }

  async function bulkAccept() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);

    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/shop/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "accepted" }),
        })
          .then((res) => ({ id, ok: res.ok }))
          .catch(() => ({ id, ok: false }))
      )
    );

    const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setOrders((prev) => prev.map((o) => (succeededIds.has(o.id) ? { ...o, status: "accepted" } : o)));
    setSelectedIds(new Set());
    setBulkBusy(false);

    const failedCount = results.length - succeededIds.size;
    if (failedCount === 0) {
      toast(`${succeededIds.size} order${succeededIds.size > 1 ? "s" : ""} accepted`);
    } else {
      toast(`${succeededIds.size} accepted, ${failedCount} failed — try those individually`, "error");
    }
    if (succeededIds.size > 0) window.dispatchEvent(new Event("groovia:pending-orders-changed"));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>Orders</h1>
            <InfoTooltip
              items={[
                { color: "#B7791F", label: "Pending", hint: "awaiting shop response" },
                { color: "#1D4ED8", label: "Accepted", hint: "shop confirmed, not yet started" },
                { color: "#6D28D9", label: "Preparing", hint: "being packed" },
                { color: "#0F9D6B", label: "Ready", hint: "ready for pickup/delivery" },
                { color: "#4B5563", label: "Completed", hint: "handed over to customer" },
                { color: "var(--error)", label: "Rejected / Cancelled", hint: "order did not go through" },
              ]}
            />
          </div>
          <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", marginTop: 4 }}>Track order lifecycle and fulfillment.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Export the orders currently shown to a CSV file" aria-label="Export the orders currently shown to a CSV file"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--surface-border)",
              background: "#FFFFFF",
              color: "var(--ink-muted)",
              fontSize: "var(--text-sm)",
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
            title="Refresh now" aria-label="Refresh now"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--surface-border)",
              background: "#FFFFFF",
              color: "var(--ink-muted)",
              fontSize: "var(--text-sm)",
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
          <Search size={14} color="var(--ink-faint)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer name or phone…"
            style={{ ...S.input, paddingLeft: 30 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ink-muted)", marginBottom: 4, fontWeight: 600 }}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--surface-border)", background: "#FFFFFF", color: "var(--ink)", fontSize: "var(--text-base)", fontFamily: "inherit" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ink-muted)", marginBottom: 4, fontWeight: 600 }}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--surface-border)", background: "#FFFFFF", color: "var(--ink)", fontSize: "var(--text-base)", fontFamily: "inherit" }}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={S.btn("var(--surface-hover)", "var(--ink)")}
            >
              Clear dates
            </button>
          )}
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
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: "1px solid " + (active ? "var(--brand)" : "var(--surface-border)"),
                  background: active ? "var(--brand-light)" : "#FFFFFF",
                  color: active ? "var(--brand-dark)" : "var(--ink-muted)",
                }}
              >
                {tab.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {canManage && selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--brand-light)",
            border: "1px solid rgba(0,104,95,0.35)",
          }}
        >
          <span style={{ fontSize: "var(--text-base)", color: "var(--brand-dark)", fontWeight: 600 }}>
            {selectedIds.size} order{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={bulkAccept}
            disabled={bulkBusy}
            style={{ ...S.btn("var(--brand)", "#fff"), padding: "6px 12px", opacity: bulkBusy ? 0.5 : 1 }}
          >
            <Check size={13} />
            {bulkBusy ? "Accepting…" : "Accept selected"}
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} style={{ ...S.btn("transparent", "var(--ink-muted)"), padding: "6px 10px" }}>
            Clear
          </button>
        </div>
      )}

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {canManage && (
                  <th style={{ ...S.th, width: 32 }}>
                    {selectablePendingIds.length > 0 && (
                      <input type="checkbox" checked={allSelectableSelected} onChange={toggleSelectAll} title="Select all pending orders" aria-label="Select all pending orders" />
                    )}
                  </th>
                )}
                <th style={S.th}>Order</th>
                <th style={S.th}>Customer</th>
                <th style={{ ...S.th, textAlign: "right" }}>Items</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Placed</th>
                {showRevenue && <th style={{ ...S.th, textAlign: "right" }}>Total</th>}
                <th style={{ ...S.th, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={(showRevenue ? 7 : 6) + (canManage ? 1 : 0)}>
                    {orders.length === 0 ? (
                      <EmptyState
                        icon={ShoppingBag}
                        title="No orders yet"
                        description="Orders placed by customers on WhatsApp will show up here as soon as they come in."
                        compact
                      />
                    ) : (
                      <EmptyState icon={Search} title="No orders match your search" description="Try a different order number, name, or phone number." compact />
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const [color, background] = STATUS_STYLE[o.status];
                  const busy = busyId === o.id;
                  const isAgingUrgent = o.status === "pending" && getAgingLevel(getOrderAgeMinutes(o.created_at, now)) === "urgent";
                  return (
                    <tr key={o.id} style={isAgingUrgent ? { boxShadow: "inset 3px 0 0 var(--error)" } : undefined}>
                      {canManage && (
                        <td style={S.td}>
                          {o.status === "pending" && (
                            <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelected(o.id)} />
                          )}
                        </td>
                      )}
                      <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>
                        <Link href={`/dashboard/orders/${o.id}`} style={{ color: "var(--brand-dark)", textDecoration: "none" }}>
                          #{o.order_number}
                        </Link>
                      </td>
                      <td style={S.td}>
                        {o.customer_name ? (
                          <div>
                            <div style={{ color: "var(--ink)" }}>{o.customer_name}</div>
                            {o.customer_phone && (
                              <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", marginTop: 1 }}>{o.customer_phone}</div>
                            )}
                          </div>
                        ) : (
                          o.customer_phone || "—"
                        )}
                      </td>
                      <td style={{ ...S.td, textAlign: "right", color: "var(--ink-muted)" }}>{o.item_count}</td>
                      <td style={S.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={S.badge(color, background)}>{o.status}</span>
                            {o.status === "pending" && <OrderAgeBadge createdAt={o.created_at} now={now} />}
                          </div>
                          {canManage && NEXT_ACTIONS[o.status].length > 0 && (
                            <select
                              value=""
                              disabled={busy}
                              aria-label={`Change status for order ${o.order_number}`}
                              onChange={(e) => {
                                const nextStatus = e.target.value as OrderStatus;
                                const action = NEXT_ACTIONS[o.status].find((a) => a.status === nextStatus);
                                e.target.value = "";
                                if (action) requestStatus(o, action.status, action.needsReason);
                              }}
                              style={{
                                fontSize: "var(--text-xs)",
                                padding: "3px 6px",
                                borderRadius: 6,
                                border: "1px solid var(--surface-border)",
                                background: "#FFFFFF",
                                color: "var(--ink-muted)",
                                fontFamily: "inherit",
                                cursor: busy ? "default" : "pointer",
                              }}
                            >
                              <option value="" disabled>Change status…</option>
                              {NEXT_ACTIONS[o.status].map((action) => (
                                <option key={action.status} value={action.status}>{action.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                        {o.pickup_slot_label ?? format(new Date(o.created_at), "MMM d, HH:mm")}
                      </td>
                      {showRevenue && (
                        <td style={{ ...S.td, textAlign: "right", color: "var(--ink)", fontWeight: 600 }}>
                          ₹{Number(o.total_amount).toFixed(2)}
                        </td>
                      )}
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                          {o.status === "pending" && canManage && (
                            <button
                              type="button"
                              disabled={busy}
                              title="Accept order" aria-label="Accept order"
                              onClick={() => quickAccept(o.id)}
                              style={{ ...S.btn("var(--brand)", "#fff"), padding: "6px 10px", opacity: busy ? 0.5 : 1 }}
                            >
                              <Check size={13} />
                            </button>
                          )}
                          <Link href={`/dashboard/orders/${o.id}`} style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)", textDecoration: "none" }}>
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reasonPrompt && (
        <OrderReasonModal
          title={`Reason for marking order #${reasonPrompt.orderNumber} ${reasonPrompt.nextStatus}`}
          presetReasons={declineReasons}
          busy={busyId === reasonPrompt.orderId}
          onCancel={() => setReasonPrompt(null)}
          onConfirm={(reason) => applyStatus(reasonPrompt.orderId, reasonPrompt.nextStatus, reason)}
        />
      )}
    </div>
  );
}
