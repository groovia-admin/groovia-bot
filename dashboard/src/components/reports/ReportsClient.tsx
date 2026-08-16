"use client";

import { useMemo, useState } from "react";
import {
  Download, TrendingUp, TrendingDown, Minus, ShoppingBag, Package, XCircle,
  PiggyBank, Clock, Boxes, MessageCircle, Layers, Users, UserCog, AlertTriangle,
  ChevronUp, ChevronDown, BarChart3, Timer, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import EmptyState from "@/components/ui/EmptyState";
import { toCsv, downloadCsv } from "@/lib/csv";
import { getOrderAgeMinutes, getAgingLevel, formatAgeShort, AGING_COLOR } from "@/lib/orderAging";
import { TrendLineChart, RankedBarChart } from "@/components/reports/charts";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  payment_method: string | null;
  total_amount: number;
  subtotal: number;
  created_via: string | null;
  last_updated_via: string | null;
  customer_id: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
};

type OrderItemRow = {
  product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  order_status: string | null;
  order_created_at: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  category_id: string | null;
  unit: string;
  cost_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
};

type CategoryRow = { id: string; name: string };

type MovementRow = {
  id: string;
  product_id: string | null;
  quantity_delta: number;
  movement_type: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

type AuditLogRow = {
  id: string;
  actor_type: string;
  action: string;
  entity_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type CustomerRow = { id: string; full_name: string | null; phone: string };

type Props = {
  showRevenue: boolean;
  windowDays: number;
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  products: ProductRow[];
  categories: CategoryRow[];
  movements: MovementRow[];
  auditLogs: AuditLogRow[];
  customers: CustomerRow[];
};

type ReportId =
  | "sales-summary" | "pending-orders" | "low-stock" | "stock-movements" | "channel-split"
  | "sales-trend" | "top-products" | "category-performance" | "fulfillment-speed"
  | "cancellation-reasons" | "customer-activity" | "gross-margin" | "staff-activity";

type ReportMeta = { id: ReportId; label: string; icon: React.ElementType; tier: 1 | 2; ownerOnly?: boolean; rangeIndependent?: boolean };

// Labels match the terms shops already see elsewhere in the industry
// (Zoho/Tally-style "Stock Ledger", Shopify-style "Best & Worst Sellers",
// "Sales by Channel") rather than internal/engineering phrasing.
const REPORTS: ReportMeta[] = [
  { id: "sales-summary", label: "Sales Summary", icon: BarChart3, tier: 1 },
  { id: "pending-orders", label: "Pending Orders", icon: Clock, tier: 1, rangeIndependent: true },
  { id: "low-stock", label: "Inventory Alerts", icon: AlertTriangle, tier: 1, rangeIndependent: true },
  { id: "stock-movements", label: "Stock Ledger", icon: Boxes, tier: 1 },
  { id: "channel-split", label: "Sales by Channel", icon: MessageCircle, tier: 1 },
  { id: "sales-trend", label: "Sales Trends", icon: TrendingUp, tier: 2 },
  { id: "top-products", label: "Best & Worst Sellers", icon: Package, tier: 2 },
  { id: "category-performance", label: "Category Performance", icon: Layers, tier: 2 },
  { id: "fulfillment-speed", label: "Fulfillment Time", icon: Timer, tier: 2 },
  { id: "cancellation-reasons", label: "Cancellation Reasons", icon: XCircle, tier: 2 },
  { id: "customer-activity", label: "Customer Insights", icon: Users, tier: 2 },
  { id: "gross-margin", label: "Gross Margin", icon: PiggyBank, tier: 2, ownerOnly: true },
  { id: "staff-activity", label: "Team Performance", icon: UserCog, tier: 2 },
];

const MOVEMENT_LABEL: Record<string, string> = {
  initial_stock: "Initial stock",
  sale: "Sold (order accepted)",
  restock: "Restocked",
  manual_adjustment: "Manual edit",
  damaged: "Damaged/written off",
  returned: "Returned",
  cancelled_order: "Order cancelled — stock restored",
};

type Preset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function todayStr(): string {
  return isoDate(new Date());
}
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}
function fmtMoney(n: number): string {
  return `₹${n.toFixed(0)}`;
}

function ExportButton<T extends Record<string, unknown>>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: { key: keyof T; label: string }[];
  filename: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
      disabled={rows.length === 0}
      style={{ ...S.btn("var(--surface)", "var(--ink-muted)"), opacity: rows.length === 0 ? 0.5 : 1, border: "1px solid var(--surface-border)" }}
    >
      <Download size={13} />
      Export CSV
    </button>
  );
}

function ReportHeader({ title, subtitle, exportNode }: { title: string; subtitle: string; exportNode?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>{title}</h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", marginTop: 3 }}>{subtitle}</p>
      </div>
      {exportNode}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  prevValue,
  rawValue,
  invertDelta,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: string;
  prevValue?: number;
  rawValue?: number;
  invertDelta?: boolean;
  hint?: string;
}) {
  const current = rawValue ?? Number(value.replace(/[^0-9.-]/g, ""));
  const hasComparison = prevValue !== undefined;
  const delta = hasComparison && prevValue! > 0 ? ((current - prevValue!) / prevValue!) * 100 : null;
  const noChange = hasComparison && prevValue === 0 && current === 0;
  const isGood = delta === null ? null : invertDelta ? delta < 0 : delta > 0;

  return (
    <div style={S.card} title={hint} aria-label={hint}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>{label}</span>
        <Icon size={15} color={accent ?? "var(--ink-faint)"} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: accent ?? "var(--ink)" }}>{value}</div>
        {hasComparison && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "var(--text-xs)", fontWeight: 700, color: noChange || delta === null ? "var(--ink-faint)" : isGood ? "var(--brand-dark)" : "var(--error)" }}>
            {noChange || delta === null ? <Minus size={11} /> : delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {noChange ? "—" : delta === null ? "new" : `${Math.abs(delta).toFixed(0)}%`}
          </span>
        )}
      </div>
      {hasComparison && <div style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)", marginTop: 2 }}>vs {prevValue} previous period</div>}
    </div>
  );
}

const NAV_COLLAPSE_STORAGE_KEY = "groovia_reports_nav_collapsed";

export default function ReportsClient({ showRevenue, windowDays, orders, orderItems, products, categories, movements, auditLogs, customers }: Props) {
  const [reportId, setReportId] = useState<ReportId>("sales-summary");
  const [preset, setPreset] = useState<Preset>("today");
  // Same idea as the main dashboard Sidebar's collapse toggle — this nav
  // list eats 240px that's dead weight once you already know which report
  // you're looking at, so let it shrink to an icon rail the same way.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY) === "1";
  });

  function toggleNavCollapsed() {
    setNavCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }
  const [rangeFrom, setRangeFrom] = useState(todayStr());
  const [rangeTo, setRangeTo] = useState(todayStr());

  const visibleReports = REPORTS.filter((r) => !r.ownerOnly || showRevenue);
  const activeMeta = REPORTS.find((r) => r.id === reportId)!;

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "today") { setRangeFrom(todayStr()); setRangeTo(todayStr()); }
    else if (p === "yesterday") { const y = daysAgoStr(1); setRangeFrom(y); setRangeTo(y); }
    else if (p === "7d") { setRangeFrom(daysAgoStr(6)); setRangeTo(todayStr()); }
    else if (p === "30d") { setRangeFrom(daysAgoStr(29)); setRangeTo(todayStr()); }
    else if (p === "90d") { setRangeFrom(daysAgoStr(windowDays - 1)); setRangeTo(todayStr()); }
  }

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    return d >= rangeFrom && d <= rangeTo;
  };

  const filteredOrders = useMemo(() => orders.filter((o) => inRange(o.created_at)), [orders, rangeFrom, rangeTo]);
  const filteredItems = useMemo(() => orderItems.filter((i) => inRange(i.order_created_at)), [orderItems, rangeFrom, rangeTo]);
  const filteredMovements = useMemo(() => movements.filter((m) => inRange(m.created_at)), [movements, rangeFrom, rangeTo]);
  const filteredAuditLogs = useMemo(() => auditLogs.filter((a) => inRange(a.created_at)), [auditLogs, rangeFrom, rangeTo]);

  // Equal-length window immediately preceding the selected range, for the
  // vs-previous-period deltas on Sales Summary — same idea as the old
  // Analytics page's fixed 30-vs-30, just generalized to whatever range
  // is currently picked.
  const prevRange = useMemo(() => {
    const spanDays = Math.round((new Date(rangeTo).getTime() - new Date(rangeFrom).getTime()) / 86400000) + 1;
    const prevTo = new Date(rangeFrom); prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (spanDays - 1));
    return { from: isoDate(prevFrom), to: isoDate(prevTo) };
  }, [rangeFrom, rangeTo]);
  const prevOrders = useMemo(
    () => orders.filter((o) => { const d = o.created_at.slice(0, 10); return d >= prevRange.from && d <= prevRange.to; }),
    [orders, prevRange]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>Reports</h1>
        <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", marginTop: 4 }}>
          Daily operations and business performance, from real order and stock data — last {windowDays} days available.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: navCollapsed ? "48px 1fr" : "240px 1fr", gap: 16, alignItems: "start", transition: "grid-template-columns .15s ease" }}>
        <div style={{ ...S.card, padding: 10, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 12 }}>
          <button
            type="button"
            onClick={toggleNavCollapsed}
            title={navCollapsed ? "Expand report list" : "Collapse report list"}
            aria-label={navCollapsed ? "Expand report list" : "Collapse report list"}
            style={{
              display: "flex", alignItems: "center", justifyContent: navCollapsed ? "center" : "flex-end",
              padding: "4px 6px", marginBottom: 4, borderRadius: 6, border: "none", background: "transparent",
              color: "var(--ink-faint)", cursor: "pointer",
            }}
          >
            {navCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>

          {!navCollapsed && (
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 10px 8px" }}>
              Daily operations
            </div>
          )}
          {visibleReports.filter((r) => r.tier === 1).map((r) => (
            <ReportNavItem key={r.id} meta={r} active={reportId === r.id} collapsed={navCollapsed} onClick={() => setReportId(r.id)} />
          ))}
          {!navCollapsed && (
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "16px 10px 8px", borderTop: "1px solid var(--surface-border)", marginTop: 6 }}>
              Business performance
            </div>
          )}
          {navCollapsed && <div style={{ borderTop: "1px solid var(--surface-border)", margin: "6px 4px" }} />}
          {visibleReports.filter((r) => r.tier === 2).map((r) => (
            <ReportNavItem key={r.id} meta={r} active={reportId === r.id} collapsed={navCollapsed} onClick={() => setReportId(r.id)} />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {activeMeta.rangeIndependent ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-faint)", background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: 8, padding: "8px 12px" }}>
              This report always shows current data — the date range below doesn&apos;t apply to it.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {([
                ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", `Last ${windowDays} days`],
              ] as [Preset, string][]).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    border: "1px solid " + (preset === p ? "var(--brand)" : "var(--surface-border)"),
                    background: preset === p ? "var(--brand-light)" : "#FFFFFF",
                    color: preset === p ? "var(--brand-dark)" : "var(--ink-muted)",
                  }}
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo}
                onChange={(e) => { setRangeFrom(e.target.value); setPreset("custom"); }}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--surface-border)", fontSize: "var(--text-sm)", fontFamily: "inherit" }}
              />
              <span style={{ color: "var(--ink-faint)", fontSize: "var(--text-sm)" }}>to</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom}
                max={todayStr()}
                onChange={(e) => { setRangeTo(e.target.value); setPreset("custom"); }}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--surface-border)", fontSize: "var(--text-sm)", fontFamily: "inherit" }}
              />
            </div>
          )}

          {reportId === "sales-summary" && (
            <SalesSummaryReport orders={filteredOrders} prevOrders={prevOrders} showRevenue={showRevenue} rangeFrom={rangeFrom} rangeTo={rangeTo} />
          )}
          {reportId === "pending-orders" && <PendingOrdersReport orders={orders} />}
          {reportId === "low-stock" && <LowStockReport products={products} categoryById={categoryById} />}
          {reportId === "stock-movements" && <StockMovementsReport movements={filteredMovements} productById={productById} />}
          {reportId === "channel-split" && <ChannelSplitReport orders={filteredOrders} showRevenue={showRevenue} />}
          {reportId === "sales-trend" && <SalesTrendReport orders={filteredOrders} rangeFrom={rangeFrom} rangeTo={rangeTo} showRevenue={showRevenue} />}
          {reportId === "top-products" && <TopProductsReport items={filteredItems} showRevenue={showRevenue} productById={productById} categoryById={categoryById} />}
          {reportId === "category-performance" && <CategoryPerformanceReport items={filteredItems} productById={productById} categoryById={categoryById} showRevenue={showRevenue} />}
          {reportId === "fulfillment-speed" && <FulfillmentSpeedReport orders={filteredOrders} />}
          {reportId === "cancellation-reasons" && <CancellationReasonsReport orders={filteredOrders} />}
          {reportId === "customer-activity" && <CustomerActivityReport orders={filteredOrders} customerById={customerById} showRevenue={showRevenue} />}
          {reportId === "gross-margin" && showRevenue && <GrossMarginReport items={filteredItems} productById={productById} />}
          {reportId === "staff-activity" && <StaffActivityReport auditLogs={filteredAuditLogs} />}
        </div>
      </div>
    </div>
  );
}

type SortDir = "asc" | "desc";

// Every table report owns its own sortKey/sortDir state (declared per
// report below) — this is just the clickable, direction-indicating <th>
// they all render through, so a click-to-sort column looks and behaves
// identically everywhere in Reports instead of each table reinventing it.
function SortableTh({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th
      style={{ ...S.th, textAlign: align ?? "left", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {label}
        {active ? (dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronDown size={11} style={{ opacity: 0.25 }} />}
      </span>
    </th>
  );
}

function ReportNavItem({ meta, active, collapsed, onClick }: { meta: ReportMeta; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? meta.label : undefined}
      aria-label={collapsed ? meta.label : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 9, justifyContent: collapsed ? "center" : "flex-start",
        textAlign: "left", padding: collapsed ? "8px 0" : "8px 10px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
        fontSize: "var(--text-sm)", fontWeight: active ? 700 : 500,
        background: active ? "var(--brand-light)" : "transparent",
        color: active ? "var(--brand-dark)" : "var(--ink-muted)",
        border: "none", borderLeft: active ? "3px solid var(--brand)" : "3px solid transparent",
        transition: "background .12s ease, color .12s ease",
      }}
    >
      <Icon size={14} style={{ flexShrink: 0, opacity: active ? 1 : 0.65 }} />
      {!collapsed && meta.label}
    </button>
  );
}

// ── Tier 1 ──────────────────────────────────────────────────────────────

function SalesSummaryReport({ orders, prevOrders, showRevenue, rangeFrom, rangeTo }: { orders: OrderRow[]; prevOrders: OrderRow[]; showRevenue: boolean; rangeFrom: string; rangeTo: string }) {
  const completed = orders.filter((o) => o.status === "completed");
  const failed = orders.filter((o) => o.status === "rejected" || o.status === "cancelled");
  const revenue = completed.reduce((s, o) => s + Number(o.total_amount), 0);
  const aov = completed.length > 0 ? revenue / completed.length : 0;

  const prevCompleted = prevOrders.filter((o) => o.status === "completed");
  const prevFailed = prevOrders.filter((o) => o.status === "rejected" || o.status === "cancelled");
  const prevRevenue = prevCompleted.reduce((s, o) => s + Number(o.total_amount), 0);
  const prevAov = prevCompleted.length > 0 ? prevRevenue / prevCompleted.length : 0;

  const rows = orders.map((o) => ({
    order_number: o.order_number,
    status: o.status,
    total: Number(o.total_amount).toFixed(2),
    placed_at: o.created_at,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ReportHeader
        title="Sales Summary"
        subtitle={`${rangeFrom} to ${rangeTo}, vs the same-length period before it`}
        exportNode={<ExportButton rows={rows} columns={[{ key: "order_number", label: "Order #" }, { key: "status", label: "Status" }, { key: "total", label: "Total (₹)" }, { key: "placed_at", label: "Placed at" }]} filename={`sales-summary-${rangeFrom}-to-${rangeTo}.csv`} />}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <StatCard icon={ShoppingBag} label="Orders" value={String(orders.length)} prevValue={prevOrders.length} />
        <StatCard icon={Package} label="Completed" value={String(completed.length)} prevValue={prevCompleted.length} />
        <StatCard icon={XCircle} label="Rejected / cancelled" value={String(failed.length)} prevValue={prevFailed.length} accent="var(--error)" invertDelta />
        {showRevenue && <StatCard icon={TrendingUp} label="Revenue" value={fmtMoney(revenue)} prevValue={prevRevenue} rawValue={revenue} accent="var(--brand-dark)" />}
        {showRevenue && <StatCard icon={TrendingUp} label="Avg order value" value={fmtMoney(aov)} prevValue={prevAov} rawValue={aov} />}
      </div>
      {orders.length === 0 && <EmptyState icon={ShoppingBag} title="No orders in this period" compact />}
    </div>
  );
}

function PendingOrdersReport({ orders }: { orders: OrderRow[] }) {
  const [sortKey, setSortKey] = useState<"order" | "age" | "total">("age");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: "order" | "age" | "total") {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "order" ? "asc" : "desc"); }
  }

  const pending = orders
    .filter((o) => o.status === "pending")
    .map((o) => ({ ...o, ageMinutes: getOrderAgeMinutes(o.created_at) }))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "order") return a.order_number.localeCompare(b.order_number) * dir;
      if (sortKey === "total") return (Number(a.total_amount) - Number(b.total_amount)) * dir;
      return (a.ageMinutes - b.ageMinutes) * dir;
    });

  const rows = pending.map((o) => ({ order_number: o.order_number, age: formatAgeShort(o.ageMinutes), total: Number(o.total_amount).toFixed(2), placed_at: o.created_at }));

  return (
    <div>
      <ReportHeader
        title="Pending Orders"
        subtitle="Every order still waiting on a response — click a column to sort"
        exportNode={<ExportButton rows={rows} columns={[{ key: "order_number", label: "Order #" }, { key: "age", label: "Age" }, { key: "total", label: "Total (₹)" }, { key: "placed_at", label: "Placed at" }]} filename="pending-orders.csv" />}
      />
      {pending.length === 0 ? (
        <div style={S.card}><EmptyState icon={Clock} title="Nothing pending" description="Every order has been responded to." compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Order" active={sortKey === "order"} dir={sortDir} onClick={() => toggle("order")} />
                  <SortableTh label="Age" active={sortKey === "age"} dir={sortDir} onClick={() => toggle("age")} />
                  <SortableTh label="Total" align="right" active={sortKey === "total"} dir={sortDir} onClick={() => toggle("total")} />
                </tr>
              </thead>
              <tbody>
                {pending.map((o) => {
                  const level = getAgingLevel(o.ageMinutes);
                  const c = AGING_COLOR[level];
                  return (
                    <tr key={o.id}>
                      <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>#{o.order_number}</td>
                      <td style={S.td}><span style={S.badge(c.color, c.background)}>{formatAgeShort(o.ageMinutes)}</span></td>
                      <td style={{ ...S.td, textAlign: "right" }}>₹{Number(o.total_amount).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LowStockReport({ products, categoryById }: { products: ProductRow[]; categoryById: Map<string, string> }) {
  const [sortKey, setSortKey] = useState<"name" | "category" | "stock" | "threshold">("stock");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "category" ? "asc" : "asc"); }
  }

  const low = products
    .filter((p) => p.stock_quantity <= p.low_stock_threshold)
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "category") return (categoryById.get(a.category_id ?? "") ?? "").localeCompare(categoryById.get(b.category_id ?? "") ?? "") * dir;
      if (sortKey === "threshold") return (a.low_stock_threshold - b.low_stock_threshold) * dir;
      return (a.stock_quantity - b.stock_quantity) * dir;
    });
  const rows = low.map((p) => ({ name: p.name, category: categoryById.get(p.category_id ?? "") ?? "—", unit: p.unit, stock: p.stock_quantity, threshold: p.low_stock_threshold }));

  return (
    <div>
      <ReportHeader
        title="Inventory Alerts"
        subtitle="Products at or below their reorder threshold, right now — click a column to sort"
        exportNode={<ExportButton rows={rows} columns={[{ key: "name", label: "Product" }, { key: "category", label: "Category" }, { key: "unit", label: "Unit" }, { key: "stock", label: "Stock" }, { key: "threshold", label: "Threshold" }]} filename="low-stock.csv" />}
      />
      {low.length === 0 ? (
        <div style={S.card}><EmptyState icon={Boxes} title="Nothing low on stock" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Product" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
                  <SortableTh label="Category" active={sortKey === "category"} dir={sortDir} onClick={() => toggle("category")} />
                  <SortableTh label="Stock" align="right" active={sortKey === "stock"} dir={sortDir} onClick={() => toggle("stock")} />
                  <SortableTh label="Threshold" align="right" active={sortKey === "threshold"} dir={sortDir} onClick={() => toggle("threshold")} />
                </tr>
              </thead>
              <tbody>
                {low.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{p.name}</td>
                    <td style={S.td}>{categoryById.get(p.category_id ?? "") ?? "—"}</td>
                    <td style={{ ...S.td, textAlign: "right", color: p.stock_quantity === 0 ? "var(--error)" : "#B7791F", fontWeight: 700 }}>{p.stock_quantity} {p.unit}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{p.low_stock_threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StockMovementsReport({ movements, productById }: { movements: MovementRow[]; productById: Map<string, ProductRow> }) {
  const [sortKey, setSortKey] = useState<"when" | "product" | "type" | "change">("when");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "when" || key === "change" ? "desc" : "asc"); }
  }

  const sorted = [...movements].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "product") return (productById.get(a.product_id ?? "")?.name ?? "").localeCompare(productById.get(b.product_id ?? "")?.name ?? "") * dir;
    if (sortKey === "type") return (MOVEMENT_LABEL[a.movement_type] ?? a.movement_type).localeCompare(MOVEMENT_LABEL[b.movement_type] ?? b.movement_type) * dir;
    if (sortKey === "change") return (a.quantity_delta - b.quantity_delta) * dir;
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
  });

  const rows = sorted.map((m) => ({
    product: productById.get(m.product_id ?? "")?.name ?? "Unknown product",
    type: MOVEMENT_LABEL[m.movement_type] ?? m.movement_type,
    change: m.quantity_delta,
    notes: m.notes ?? "",
    when: m.created_at,
  }));

  return (
    <div>
      <ReportHeader
        title="Stock Ledger"
        subtitle="Every sale, restock, and manual edit in the selected range — click a column to sort"
        exportNode={<ExportButton rows={rows} columns={[{ key: "product", label: "Product" }, { key: "type", label: "Type" }, { key: "change", label: "Change" }, { key: "notes", label: "Notes" }, { key: "when", label: "When" }]} filename="stock-movements.csv" />}
      />
      {movements.length === 0 ? (
        <div style={S.card}><EmptyState icon={Boxes} title="No stock movements in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="When" active={sortKey === "when"} dir={sortDir} onClick={() => toggle("when")} />
                  <SortableTh label="Product" active={sortKey === "product"} dir={sortDir} onClick={() => toggle("product")} />
                  <SortableTh label="Type" active={sortKey === "type"} dir={sortDir} onClick={() => toggle("type")} />
                  <th style={S.th}>Notes</th>
                  <SortableTh label="Change" align="right" active={sortKey === "change"} dir={sortDir} onClick={() => toggle("change")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => {
                  const positive = m.quantity_delta > 0;
                  return (
                    <tr key={m.id}>
                      <td style={{ ...S.td, whiteSpace: "nowrap", color: "var(--ink-muted)" }}>{new Date(m.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ ...S.td, color: "var(--ink)" }}>{productById.get(m.product_id ?? "")?.name ?? "Unknown product"}</td>
                      <td style={S.td}>{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                      <td style={{ ...S.td, color: "var(--ink-faint)" }}>{m.notes ?? "—"}</td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: positive ? "var(--brand-dark)" : "var(--error)" }}>{positive ? "+" : ""}{m.quantity_delta}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelSplitReport({ orders, showRevenue }: { orders: OrderRow[]; showRevenue: boolean }) {
  const byChannel = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const key = o.created_via ?? "unknown";
    const existing = byChannel.get(key) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    if (o.status === "completed") existing.revenue += Number(o.total_amount);
    byChannel.set(key, existing);
  }
  const entries = Array.from(byChannel.entries()).sort((a, b) => b[1].count - a[1].count);
  const rows = entries.map(([channel, v]) => ({ channel, orders: v.count, revenue: v.revenue.toFixed(2) }));

  return (
    <div>
      <ReportHeader
        title="Sales by Channel"
        subtitle="Where orders actually came from — WhatsApp bot vs. the web storefront"
        exportNode={<ExportButton rows={rows} columns={[{ key: "channel", label: "Channel" }, { key: "orders", label: "Orders" }, { key: "revenue", label: "Revenue (₹)" }]} filename="channel-split.csv" />}
      />
      {entries.length === 0 ? (
        <div style={S.card}><EmptyState icon={MessageCircle} title="No orders in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <RankedBarChart
            data={entries.map(([channel, v]) => ({
              label: channel,
              value: v.count,
              valueLabel: showRevenue ? `${v.count} · ${fmtMoney(v.revenue)}` : `${v.count} order${v.count === 1 ? "" : "s"}`,
            }))}
            color="var(--brand)"
            capitalizeLabels
          />
        </div>
      )}
    </div>
  );
}

// ── Tier 2 ──────────────────────────────────────────────────────────────

function SalesTrendReport({ orders, rangeFrom, rangeTo, showRevenue }: { orders: OrderRow[]; rangeFrom: string; rangeTo: string; showRevenue: boolean }) {
  const days: string[] = [];
  const cursor = new Date(rangeFrom);
  const end = new Date(rangeTo);
  while (cursor <= end) { days.push(isoDate(cursor)); cursor.setDate(cursor.getDate() + 1); }

  const buckets = new Map(days.map((d) => [d, { revenue: 0, count: 0 }]));
  for (const o of orders) {
    const key = o.created_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      if (o.status === "completed") bucket.revenue += Number(o.total_amount);
    }
  }
  const trend = days.map((d) => ({ date: d, ...buckets.get(d)! }));
  const rows = trend.map((d) => ({ date: d.date, orders: d.count, revenue: d.revenue.toFixed(2) }));

  return (
    <div>
      <ReportHeader
        title="Sales Trends"
        subtitle={`${showRevenue ? "Revenue" : "Order count"} by day, ${rangeFrom} to ${rangeTo}`}
        exportNode={<ExportButton rows={rows} columns={[{ key: "date", label: "Date" }, { key: "orders", label: "Orders" }, { key: "revenue", label: "Revenue (₹)" }]} filename={`sales-trend-${rangeFrom}-to-${rangeTo}.csv`} />}
      />
      <div style={S.card}>
        {orders.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No orders in this period yet" compact />
        ) : (
          <TrendLineChart
            data={trend.map((d) => ({
              label: new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
              value: showRevenue ? d.revenue : d.count,
            }))}
            color="var(--brand)"
            valueFormatter={(v) => (showRevenue ? fmtMoney(v) : `${v} order${v === 1 ? "" : "s"}`)}
          />
        )}
      </div>
    </div>
  );
}

function TopProductsReport({
  items,
  showRevenue,
  productById,
  categoryById,
}: {
  items: OrderItemRow[];
  showRevenue: boolean;
  productById: Map<string, ProductRow>;
  categoryById: Map<string, string>;
}) {
  const [sortKey, setSortKey] = useState<"name" | "category" | "qty" | "revenue">(showRevenue ? "revenue" : "qty");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "category" ? "asc" : "desc"); }
  }

  const totals = new Map<string, { qty: number; revenue: number; productId: string | null }>();
  for (const item of items) {
    if (item.order_status !== "completed") continue;
    const existing = totals.get(item.product_name_snapshot) ?? { qty: 0, revenue: 0, productId: item.product_id };
    existing.qty += Number(item.quantity);
    existing.revenue += Number(item.subtotal);
    totals.set(item.product_name_snapshot, existing);
  }
  const ranked = Array.from(totals.entries())
    .map(([name, v]) => ({
      name,
      qty: v.qty,
      revenue: v.revenue,
      category: v.productId ? categoryById.get(productById.get(v.productId)?.category_id ?? "") ?? "Uncategorized" : "Uncategorized",
    }))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "category") return a.category.localeCompare(b.category) * dir;
      if (sortKey === "qty") return (a.qty - b.qty) * dir;
      return (a.revenue - b.revenue) * dir;
    });
  const rows = ranked.map((p) => ({ name: p.name, category: p.category, quantity: p.qty, revenue: p.revenue.toFixed(2) }));

  return (
    <div>
      <ReportHeader
        title="Best & Worst Sellers"
        subtitle="Every product sold in this period, with its category — click a column to sort"
        exportNode={<ExportButton rows={rows} columns={[{ key: "name", label: "Product" }, { key: "category", label: "Category" }, { key: "quantity", label: "Quantity sold" }, { key: "revenue", label: "Revenue (₹)" }]} filename="top-products.csv" />}
      />
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={Package} title="No completed orders in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Product" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
                  <SortableTh label="Category" active={sortKey === "category"} dir={sortDir} onClick={() => toggle("category")} />
                  <SortableTh label="Quantity" align="right" active={sortKey === "qty"} dir={sortDir} onClick={() => toggle("qty")} />
                  {showRevenue && <SortableTh label="Revenue" align="right" active={sortKey === "revenue"} dir={sortDir} onClick={() => toggle("revenue")} />}
                </tr>
              </thead>
              <tbody>
                {ranked.map((p) => (
                  <tr key={p.name}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{p.name}</td>
                    <td style={{ ...S.td, color: "var(--ink-muted)" }}>{p.category}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{p.qty}</td>
                    {showRevenue && <td style={{ ...S.td, textAlign: "right" }}>{fmtMoney(p.revenue)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryPerformanceReport({ items, productById, categoryById, showRevenue }: { items: OrderItemRow[]; productById: Map<string, ProductRow>; categoryById: Map<string, string>; showRevenue: boolean }) {
  const totals = new Map<string, { qty: number; revenue: number }>();
  for (const item of items) {
    if (item.order_status !== "completed") continue;
    const product = productById.get(item.product_id ?? "");
    const catName = product?.category_id ? categoryById.get(product.category_id) ?? "Uncategorized" : "Uncategorized";
    const existing = totals.get(catName) ?? { qty: 0, revenue: 0 };
    existing.qty += Number(item.quantity);
    existing.revenue += Number(item.subtotal);
    totals.set(catName, existing);
  }
  const ranked = Array.from(totals.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => (showRevenue ? b.revenue - a.revenue : b.qty - a.qty));
  const rows = ranked.map((c) => ({ category: c.name, quantity: c.qty, revenue: c.revenue.toFixed(2) }));

  return (
    <div>
      <ReportHeader
        title="Category Performance"
        subtitle="Sales rolled up by product category"
        exportNode={<ExportButton rows={rows} columns={[{ key: "category", label: "Category" }, { key: "quantity", label: "Quantity" }, { key: "revenue", label: "Revenue (₹)" }]} filename="category-performance.csv" />}
      />
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={Layers} title="No completed orders in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <RankedBarChart
            data={ranked.map((c) => ({ label: c.name, value: showRevenue ? c.revenue : c.qty }))}
            color="var(--brand-dark)"
            valueFormatter={(v) => (showRevenue ? fmtMoney(v) : String(v))}
          />
        </div>
      )}
    </div>
  );
}

function FulfillmentSpeedReport({ orders }: { orders: OrderRow[] }) {
  const completed = orders.filter((o) => o.status === "completed" && o.accepted_at);
  const stages: { label: string; deltas: number[] }[] = [
    { label: "Placed → accepted", deltas: [] },
    { label: "Accepted → ready", deltas: [] },
    { label: "Ready → completed", deltas: [] },
    { label: "Placed → completed", deltas: [] },
  ];
  for (const o of completed) {
    const placed = new Date(o.created_at).getTime();
    const accepted = o.accepted_at ? new Date(o.accepted_at).getTime() : null;
    const ready = o.ready_at ? new Date(o.ready_at).getTime() : null;
    const done = o.completed_at ? new Date(o.completed_at).getTime() : null;
    if (accepted) stages[0].deltas.push((accepted - placed) / 60000);
    if (accepted && ready) stages[1].deltas.push((ready - accepted) / 60000);
    if (ready && done) stages[2].deltas.push((done - ready) / 60000);
    if (done) stages[3].deltas.push((done - placed) / 60000);
  }
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const rows = stages.map((s) => ({ stage: s.label, avg_minutes: avg(s.deltas)?.toFixed(1) ?? "—", sample_size: s.deltas.length }));

  return (
    <div>
      <ReportHeader
        title="Fulfillment Time"
        subtitle="Average time spent in each stage, completed orders only"
        exportNode={<ExportButton rows={rows} columns={[{ key: "stage", label: "Stage" }, { key: "avg_minutes", label: "Avg minutes" }, { key: "sample_size", label: "Orders" }]} filename="fulfillment-speed.csv" />}
      />
      {completed.length === 0 ? (
        <div style={S.card}><EmptyState icon={Clock} title="No completed orders with full timestamps in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {stages.map((s) => {
              const a = avg(s.deltas);
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--surface)" }}>
                  <div style={{ fontSize: "var(--text-base)", color: "var(--ink)" }}>{s.label}</div>
                  <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--brand-dark)" }}>{a !== null ? `${a.toFixed(1)} min` : "—"} <span style={{ fontWeight: 400, color: "var(--ink-faint)", fontSize: "var(--text-sm)" }}>({s.deltas.length} orders)</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CancellationReasonsReport({ orders }: { orders: OrderRow[] }) {
  const failed = orders.filter((o) => o.status === "rejected" || o.status === "cancelled");
  const byReason = new Map<string, number>();
  for (const o of failed) {
    const reason = (o.status === "rejected" ? o.rejection_reason : o.cancellation_reason) || "No reason given";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  const ranked = Array.from(byReason.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...ranked.map((r) => r.count));

  return (
    <div>
      <ReportHeader
        title="Cancellation Reasons"
        subtitle={`${failed.length} order${failed.length === 1 ? "" : "s"} didn't go through in this period`}
        exportNode={<ExportButton rows={ranked} columns={[{ key: "reason", label: "Reason" }, { key: "count", label: "Count" }]} filename="cancellation-reasons.csv" />}
      />
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={XCircle} title="No rejections or cancellations in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ranked.map((r) => (
              <div key={r.reason} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--ink)" }}>{r.reason}</div>
                <div style={{ width: 120, background: "var(--surface)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "var(--error)" }} />
                </div>
                <div style={{ width: 24, fontSize: "var(--text-sm)", color: "var(--ink)", fontWeight: 600, textAlign: "right" }}>{r.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerActivityReport({ orders, customerById, showRevenue }: { orders: OrderRow[]; customerById: Map<string, CustomerRow>; showRevenue: boolean }) {
  const [sortKey, setSortKey] = useState<"name" | "orders" | "spent" | "lastOrder">(showRevenue ? "spent" : "orders");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  const byCustomer = new Map<string, { orders: number; spent: number; lastOrder: string }>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    const existing = byCustomer.get(o.customer_id) ?? { orders: 0, spent: 0, lastOrder: o.created_at };
    existing.orders += 1;
    if (o.status === "completed") existing.spent += Number(o.total_amount);
    if (o.created_at > existing.lastOrder) existing.lastOrder = o.created_at;
    byCustomer.set(o.customer_id, existing);
  }
  const ranked = Array.from(byCustomer.entries())
    .map(([id, v]) => ({ id, name: customerById.get(id)?.full_name || customerById.get(id)?.phone || "Unknown", ...v }))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "orders") return (a.orders - b.orders) * dir;
      if (sortKey === "spent") return (a.spent - b.spent) * dir;
      return (a.lastOrder < b.lastOrder ? -1 : a.lastOrder > b.lastOrder ? 1 : 0) * dir;
    });
  const rows = ranked.map((c) => ({ customer: c.name, orders: c.orders, spent: c.spent.toFixed(2), last_order: c.lastOrder }));

  return (
    <div>
      <ReportHeader
        title="Customer Insights"
        subtitle="Who ordered in this period — click a column to sort"
        exportNode={<ExportButton rows={rows} columns={[{ key: "customer", label: "Customer" }, { key: "orders", label: "Orders" }, { key: "spent", label: "Spent (₹)" }, { key: "last_order", label: "Last order" }]} filename="customer-activity.csv" />}
      />
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={Users} title="No customer orders in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Customer" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
                  <SortableTh label="Orders" align="right" active={sortKey === "orders"} dir={sortDir} onClick={() => toggle("orders")} />
                  {showRevenue && <SortableTh label="Spent" align="right" active={sortKey === "spent"} dir={sortDir} onClick={() => toggle("spent")} />}
                  <SortableTh label="Last order" active={sortKey === "lastOrder"} dir={sortDir} onClick={() => toggle("lastOrder")} />
                </tr>
              </thead>
              <tbody>
                {ranked.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{c.orders}</td>
                    {showRevenue && <td style={{ ...S.td, textAlign: "right" }}>{fmtMoney(c.spent)}</td>}
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>{new Date(c.lastOrder).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GrossMarginReport({ items, productById }: { items: OrderItemRow[]; productById: Map<string, ProductRow> }) {
  const [sortKey, setSortKey] = useState<"name" | "revenue" | "margin">("margin");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  const totals = new Map<string, { qty: number; revenue: number; margin: number; knownCost: boolean }>();
  let totalMargin = 0;
  let totalRevenueWithKnownCost = 0;

  for (const item of items) {
    if (item.order_status !== "completed" || !item.product_id) continue;
    const product = productById.get(item.product_id);
    const cost = product?.cost_price;
    const existing = totals.get(item.product_name_snapshot) ?? { qty: 0, revenue: 0, margin: 0, knownCost: cost !== null && cost !== undefined };
    existing.qty += Number(item.quantity);
    existing.revenue += Number(item.subtotal);
    if (cost !== null && cost !== undefined) {
      const itemMargin = (Number(item.unit_price) - Number(cost)) * Number(item.quantity);
      existing.margin += itemMargin;
      totalMargin += itemMargin;
      totalRevenueWithKnownCost += Number(item.subtotal);
    }
    totals.set(item.product_name_snapshot, existing);
  }
  const ranked = Array.from(totals.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "revenue") return (a.revenue - b.revenue) * dir;
      return (a.margin - b.margin) * dir;
    });
  const marginPct = totalRevenueWithKnownCost > 0 ? (totalMargin / totalRevenueWithKnownCost) * 100 : null;
  const rows = ranked.map((p) => ({ product: p.name, quantity: p.qty, revenue: p.revenue.toFixed(2), margin: p.knownCost ? p.margin.toFixed(2) : "unknown cost" }));

  return (
    <div>
      <ReportHeader
        title="Gross Margin"
        subtitle="At today's cost prices — order items don't snapshot cost at time of sale, so this is an approximation, not an exact historical figure. Click a column to sort."
        exportNode={<ExportButton rows={rows} columns={[{ key: "product", label: "Product" }, { key: "quantity", label: "Quantity" }, { key: "revenue", label: "Revenue (₹)" }, { key: "margin", label: "Margin (₹)" }]} filename="gross-margin.csv" />}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard icon={PiggyBank} label="Total margin" value={`${fmtMoney(totalMargin)}${marginPct !== null ? ` (${marginPct.toFixed(0)}%)` : ""}`} accent="var(--brand-dark)" />
      </div>
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={PiggyBank} title="No completed orders in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Product" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
                  <SortableTh label="Revenue" align="right" active={sortKey === "revenue"} dir={sortDir} onClick={() => toggle("revenue")} />
                  <SortableTh label="Margin" align="right" active={sortKey === "margin"} dir={sortDir} onClick={() => toggle("margin")} />
                </tr>
              </thead>
              <tbody>
                {ranked.map((p) => (
                  <tr key={p.name}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{p.name}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{fmtMoney(p.revenue)}</td>
                    <td style={{ ...S.td, textAlign: "right", color: p.knownCost ? "var(--brand-dark)" : "var(--ink-faint)", fontWeight: p.knownCost ? 700 : 400 }}>{p.knownCost ? fmtMoney(p.margin) : "no cost set"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffActivityReport({ auditLogs }: { auditLogs: AuditLogRow[] }) {
  const byActor = new Map<string, number>();
  for (const log of auditLogs) {
    const name = (log.metadata?.actor_name as string | undefined) || "Unknown";
    byActor.set(name, (byActor.get(name) ?? 0) + 1);
  }
  const ranked = Array.from(byActor.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...ranked.map((r) => r.count));

  return (
    <div>
      <ReportHeader
        title="Team Performance"
        subtitle="Order status changes made from the dashboard, per person — WhatsApp-side Accept/Reject taps aren't attributed to a person yet, so this undercounts real activity"
        exportNode={<ExportButton rows={ranked} columns={[{ key: "name", label: "Staff member" }, { key: "count", label: "Actions" }]} filename="staff-activity.csv" />}
      />
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={UserCog} title="No dashboard order actions in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ranked.map((r) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 140, fontSize: "var(--text-sm)", color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "var(--brand)" }} />
                </div>
                <div style={{ width: 30, fontSize: "var(--text-sm)", color: "var(--ink)", fontWeight: 600, textAlign: "right" }}>{r.count}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--surface-border)", fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>
            <AlertTriangle size={12} />
            Dashboard actions only — WhatsApp button taps aren&apos;t logged to a person yet.
          </div>
        </div>
      )}
    </div>
  );
}
