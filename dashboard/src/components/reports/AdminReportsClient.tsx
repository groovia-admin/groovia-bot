"use client";

import { useMemo, useState } from "react";
import {
  Download, Store, TrendingUp, ShoppingBag, AlertTriangle, MessageCircle,
  Package, Clock, ChevronUp, ChevronDown,
} from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import EmptyState from "@/components/ui/EmptyState";
import { toCsv, downloadCsv } from "@/lib/csv";

type AdminShopRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  subscription_status: string;
  is_active: boolean;
  created_at: string;
  trial_ends_at: string | null;
};

type AdminOrderRow = {
  shop_id: string;
  status: string;
  total_amount: number;
  created_at: string;
};

type Props = {
  windowDays: number;
  shops: AdminShopRow[];
  orders: AdminOrderRow[];
  connectedShopIds: string[];
  productCountByShop: Record<string, number>;
};

type ReportId = "growth" | "leaderboard" | "subscriptions" | "onboarding";

const REPORTS: { id: ReportId; label: string; icon: React.ElementType; rangeIndependent?: boolean }[] = [
  { id: "growth", label: "Platform Growth", icon: TrendingUp },
  { id: "leaderboard", label: "Shop Leaderboard", icon: ShoppingBag },
  { id: "subscriptions", label: "Subscription Health", icon: AlertTriangle, rangeIndependent: true },
  { id: "onboarding", label: "Onboarding Gaps", icon: MessageCircle, rangeIndependent: true },
];

const STATUS_COLOR: Record<string, [string, string]> = {
  trial: ["#B7791F", "rgba(245,158,11,0.12)"],
  active: ["#0F9D6B", "rgba(16,185,129,0.12)"],
  past_due: ["#C2410C", "rgba(249,115,22,0.12)"],
  expired: ["#C0392B", "rgba(239,68,68,0.12)"],
  suspended: ["#C0392B", "rgba(239,68,68,0.12)"],
  cancelled: ["#4B5563", "rgba(107,114,128,0.12)"],
};

type Preset = "7d" | "30d" | "90d" | "custom";

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

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>{label}</span>
        <Icon size={15} color={accent ?? "var(--ink-faint)"} />
      </div>
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: accent ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}

type SortDir = "asc" | "desc";

function SortableTh({ label, active, dir, align, onClick }: { label: string; active: boolean; dir: SortDir; align?: "left" | "right"; onClick: () => void }) {
  return (
    <th
      style={{ ...S.th, textAlign: align ?? "left", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {label}
        {active ? (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span style={{ width: 12, display: "inline-block" }} />}
      </span>
    </th>
  );
}

function ReportNavItem({ meta, active, onClick }: { meta: { id: ReportId; label: string; icon: React.ElementType }; active: boolean; onClick: () => void }) {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        textAlign: "left",
        padding: "9px 12px",
        borderRadius: 7,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "var(--text-sm)",
        fontWeight: active ? 700 : 500,
        background: active ? "var(--brand-light)" : "transparent",
        color: active ? "var(--brand-dark)" : "var(--ink-muted)",
        border: "none",
        borderLeft: active ? "3px solid var(--brand)" : "3px solid transparent",
        transition: "background .12s ease, color .12s ease",
      }}
    >
      <Icon size={14} style={{ flexShrink: 0, opacity: active ? 1 : 0.65 }} />
      {meta.label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const [color, bg] = STATUS_COLOR[status] ?? STATUS_COLOR.trial;
  return <span style={S.badge(color, bg)}>{status.replace("_", " ")}</span>;
}

export default function AdminReportsClient({ windowDays, shops, orders, connectedShopIds, productCountByShop }: Props) {
  const [reportId, setReportId] = useState<ReportId>("growth");
  const [preset, setPreset] = useState<Preset>("30d");
  const [rangeFrom, setRangeFrom] = useState(daysAgoStr(29));
  const [rangeTo, setRangeTo] = useState(todayStr());

  const activeMeta = REPORTS.find((r) => r.id === reportId)!;

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "7d") { setRangeFrom(daysAgoStr(6)); setRangeTo(todayStr()); }
    else if (p === "30d") { setRangeFrom(daysAgoStr(29)); setRangeTo(todayStr()); }
    else if (p === "90d") { setRangeFrom(daysAgoStr(windowDays - 1)); setRangeTo(todayStr()); }
  }

  const inRange = (dateStr: string) => {
    const d = dateStr.slice(0, 10);
    return d >= rangeFrom && d <= rangeTo;
  };

  const filteredShops = useMemo(() => shops.filter((s) => inRange(s.created_at)), [shops, rangeFrom, rangeTo]);
  const filteredOrders = useMemo(() => orders.filter((o) => inRange(o.created_at)), [orders, rangeFrom, rangeTo]);
  const connectedSet = useMemo(() => new Set(connectedShopIds), [connectedShopIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>Platform Reports</h1>
        <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", marginTop: 4 }}>
          Growth, order volume, and operational health across every shop on GrooVia — last {windowDays} days available.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ ...S.card, padding: 10, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 12 }}>
          {REPORTS.map((r) => (
            <ReportNavItem key={r.id} meta={r} active={reportId === r.id} onClick={() => setReportId(r.id)} />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {activeMeta.rangeIndependent ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-faint)", background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: 8, padding: "8px 12px" }}>
              This report always shows current data — the date range below doesn&apos;t apply to it.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {([["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", `Last ${windowDays} days`]] as [Preset, string][]).map(([p, label]) => (
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

          {reportId === "growth" && <PlatformGrowthReport shops={shops} filteredShops={filteredShops} rangeFrom={rangeFrom} rangeTo={rangeTo} />}
          {reportId === "leaderboard" && <ShopLeaderboardReport shops={shops} orders={filteredOrders} />}
          {reportId === "subscriptions" && <SubscriptionHealthReport shops={shops} />}
          {reportId === "onboarding" && <OnboardingGapsReport shops={shops} connectedSet={connectedSet} productCountByShop={productCountByShop} />}
        </div>
      </div>
    </div>
  );
}

function PlatformGrowthReport({ shops, filteredShops, rangeFrom, rangeTo }: { shops: AdminShopRow[]; filteredShops: AdminShopRow[]; rangeFrom: string; rangeTo: string }) {
  const [sortKey, setSortKey] = useState<"date" | "signups" | "cumulative">("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const totalShops = shops.length;
  const activeShops = shops.filter((s) => s.is_active).length;
  const trialShops = shops.filter((s) => s.subscription_status === "trial").length;
  const paidShops = shops.filter((s) => s.subscription_status === "active").length;

  const byDay = new Map<string, number>();
  for (const s of filteredShops) {
    const d = s.created_at.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const earlierCount = shops.filter((s) => s.created_at.slice(0, 10) < rangeFrom).length;

  let running = earlierCount;
  const chronological = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const withCumulative = chronological.map(([date, signups]) => {
    running += signups;
    return { date, signups, cumulative: running };
  });

  const sorted = [...withCumulative].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "date") return a.date.localeCompare(b.date) * dir;
    if (sortKey === "signups") return (a.signups - b.signups) * dir;
    return (a.cumulative - b.cumulative) * dir;
  });

  const rows = sorted.map((r) => ({ date: r.date, new_shops: r.signups, cumulative_shops: r.cumulative }));

  return (
    <div>
      <ReportHeader
        title="Platform Growth"
        subtitle={`New shop signups between ${rangeFrom} and ${rangeTo}, plus current platform totals — click a column to sort`}
        exportNode={<ExportButton rows={rows} columns={[{ key: "date", label: "Date" }, { key: "new_shops", label: "New shops" }, { key: "cumulative_shops", label: "Cumulative shops" }]} filename="platform-growth.csv" />}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard icon={Store} label="Total shops" value={String(totalShops)} accent="var(--ink)" />
        <StatCard icon={Store} label="Active" value={String(activeShops)} accent="var(--brand-dark)" />
        <StatCard icon={AlertTriangle} label="On trial" value={String(trialShops)} accent="#B7791F" />
        <StatCard icon={TrendingUp} label="Paid" value={String(paidShops)} accent="var(--brand-dark)" />
      </div>
      {sorted.length === 0 ? (
        <div style={S.card}><EmptyState icon={Store} title="No new shops signed up in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Date" active={sortKey === "date"} dir={sortDir} onClick={() => toggle("date")} />
                  <SortableTh label="New shops" align="right" active={sortKey === "signups"} dir={sortDir} onClick={() => toggle("signups")} />
                  <SortableTh label="Cumulative" align="right" active={sortKey === "cumulative"} dir={sortDir} onClick={() => toggle("cumulative")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.date}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{r.signups}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{r.cumulative}</td>
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

function ShopLeaderboardReport({ shops, orders }: { shops: AdminShopRow[]; orders: AdminOrderRow[] }) {
  const [sortKey, setSortKey] = useState<"name" | "orders" | "gmv" | "avg">("gmv");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: typeof sortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);

  const totals = new Map<string, { orderCount: number; gmv: number }>();
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const existing = totals.get(o.shop_id) ?? { orderCount: 0, gmv: 0 };
    existing.orderCount += 1;
    existing.gmv += Number(o.total_amount);
    totals.set(o.shop_id, existing);
  }

  const ranked = Array.from(totals.entries())
    .map(([shopId, v]) => ({
      shopId,
      name: shopById.get(shopId)?.name ?? "Unknown shop",
      city: shopById.get(shopId)?.city ?? "—",
      status: shopById.get(shopId)?.subscription_status ?? "trial",
      orders: v.orderCount,
      gmv: v.gmv,
      avg: v.orderCount > 0 ? v.gmv / v.orderCount : 0,
    }))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "orders") return (a.orders - b.orders) * dir;
      if (sortKey === "avg") return (a.avg - b.avg) * dir;
      return (a.gmv - b.gmv) * dir;
    });

  const rows = ranked.map((r) => ({ shop: r.name, city: r.city, status: r.status, orders: r.orders, gmv: r.gmv.toFixed(2), avg_order_value: r.avg.toFixed(2) }));

  return (
    <div>
      <ReportHeader
        title="Shop Leaderboard"
        subtitle="Completed orders and GMV by shop in this period — click a column to sort"
        exportNode={<ExportButton rows={rows} columns={[{ key: "shop", label: "Shop" }, { key: "city", label: "City" }, { key: "status", label: "Status" }, { key: "orders", label: "Orders" }, { key: "gmv", label: "GMV (₹)" }, { key: "avg_order_value", label: "Avg order value (₹)" }]} filename="shop-leaderboard.csv" />}
      />
      {ranked.length === 0 ? (
        <div style={S.card}><EmptyState icon={ShoppingBag} title="No completed orders across any shop in this period" compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortableTh label="Shop" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
                  <th style={S.th}>Status</th>
                  <SortableTh label="Orders" align="right" active={sortKey === "orders"} dir={sortDir} onClick={() => toggle("orders")} />
                  <SortableTh label="GMV" align="right" active={sortKey === "gmv"} dir={sortDir} onClick={() => toggle("gmv")} />
                  <SortableTh label="Avg order" align="right" active={sortKey === "avg"} dir={sortDir} onClick={() => toggle("avg")} />
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.shopId}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{r.name} <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>· {r.city}</span></td>
                    <td style={S.td}><StatusBadge status={r.status} /></td>
                    <td style={{ ...S.td, textAlign: "right" }}>{r.orders}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{fmtMoney(r.gmv)}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{fmtMoney(r.avg)}</td>
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

function SubscriptionHealthReport({ shops }: { shops: AdminShopRow[] }) {
  const byStatus = new Map<string, number>();
  for (const s of shops) byStatus.set(s.subscription_status, (byStatus.get(s.subscription_status) ?? 0) + 1);

  const now = Date.now();
  const in7Days = now + 7 * 24 * 60 * 60 * 1000;
  const expiringTrials = shops
    .filter((s) => s.subscription_status === "trial" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() <= in7Days)
    .sort((a, b) => new Date(a.trial_ends_at!).getTime() - new Date(b.trial_ends_at!).getTime());

  const needsAttention = shops
    .filter((s) => s.subscription_status === "past_due" || s.subscription_status === "suspended")
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = expiringTrials.map((s) => ({ shop: s.name, city: s.city ?? "—", trial_ends_at: s.trial_ends_at }));

  return (
    <div>
      <ReportHeader
        title="Subscription Health"
        subtitle="Where every shop stands right now, and who needs a follow-up"
        exportNode={<ExportButton rows={rows} columns={[{ key: "shop", label: "Shop" }, { key: "city", label: "City" }, { key: "trial_ends_at", label: "Trial ends" }]} filename="trials-expiring.csv" />}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
        {(["trial", "active", "past_due", "expired", "suspended", "cancelled"] as const).map((status) => (
          <StatCard key={status} icon={Store} label={status.replace("_", " ")} value={String(byStatus.get(status) ?? 0)} accent={STATUS_COLOR[status][0]} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Trials ending within 7 days</h3>
          {expiringTrials.length === 0 ? (
            <div style={S.card}><EmptyState icon={Clock} title="No trials ending soon" compact /></div>
          ) : (
            <div style={S.card}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={S.th}>Shop</th><th style={S.th}>City</th><th style={S.th}>Trial ends</th></tr></thead>
                  <tbody>
                    {expiringTrials.map((s) => (
                      <tr key={s.id}>
                        <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{s.name}</td>
                        <td style={S.td}>{s.city ?? "—"}</td>
                        <td style={{ ...S.td, color: "#B7791F", fontWeight: 600 }}>{new Date(s.trial_ends_at!).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Past due or suspended</h3>
          {needsAttention.length === 0 ? (
            <div style={S.card}><EmptyState icon={AlertTriangle} title="No shops past due or suspended" compact /></div>
          ) : (
            <div style={S.card}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={S.th}>Shop</th><th style={S.th}>City</th><th style={S.th}>Status</th></tr></thead>
                  <tbody>
                    {needsAttention.map((s) => (
                      <tr key={s.id}>
                        <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{s.name}</td>
                        <td style={S.td}>{s.city ?? "—"}</td>
                        <td style={S.td}><StatusBadge status={s.subscription_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingGapsReport({ shops, connectedSet, productCountByShop }: { shops: AdminShopRow[]; connectedSet: Set<string>; productCountByShop: Record<string, number> }) {
  const gaps = shops
    .filter((s) => s.is_active)
    .map((s) => ({
      shop: s,
      missingWhatsapp: !connectedSet.has(s.id),
      missingProducts: (productCountByShop[s.id] ?? 0) === 0,
    }))
    .filter((g) => g.missingWhatsapp || g.missingProducts)
    .sort((a, b) => a.shop.name.localeCompare(b.shop.name));

  const rows = gaps.map((g) => ({
    shop: g.shop.name,
    city: g.shop.city ?? "—",
    signed_up: g.shop.created_at.slice(0, 10),
    missing: [g.missingWhatsapp ? "WhatsApp" : null, g.missingProducts ? "Products" : null].filter(Boolean).join(" + "),
  }));

  return (
    <div>
      <ReportHeader
        title="Onboarding Gaps"
        subtitle="Active shops still missing a WhatsApp connection or a product catalog — the two things needed before they can actually take an order"
        exportNode={<ExportButton rows={rows} columns={[{ key: "shop", label: "Shop" }, { key: "city", label: "City" }, { key: "signed_up", label: "Signed up" }, { key: "missing", label: "Missing" }]} filename="onboarding-gaps.csv" />}
      />
      {gaps.length === 0 ? (
        <div style={S.card}><EmptyState icon={Package} title="Every active shop is fully onboarded" description="All shops have a WhatsApp connection and at least one product." compact /></div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={S.th}>Shop</th><th style={S.th}>City</th><th style={S.th}>Signed up</th><th style={S.th}>Missing</th></tr></thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.shop.id}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{g.shop.name}</td>
                    <td style={S.td}>{g.shop.city ?? "—"}</td>
                    <td style={S.td}>{new Date(g.shop.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {g.missingWhatsapp && <span style={S.badge("var(--error)", "var(--error-light)")}><MessageCircle size={11} /> WhatsApp</span>}
                        {g.missingProducts && <span style={S.badge("#B7791F", "rgba(245,158,11,0.12)")}><Package size={11} /> Products</span>}
                      </div>
                    </td>
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
