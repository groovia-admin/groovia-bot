"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Search, Users, CreditCard, Download } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import InfoTooltip from "@/components/ui/InfoTooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toCsv, downloadCsv } from "@/lib/csv";

type CustomerRow = {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  total_orders: number;
  total_spent: number;
  outstanding_credit: number;
  last_order_at: string | null;
  is_active: boolean;
  created_at: string;
};

type SortKey = "recent" | "spend" | "orders" | "credit";

export default function CustomersClient({ initialCustomers, showRevenue }: { initialCustomers: CustomerRow[]; showRevenue: boolean }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [creditOnly, setCreditOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = initialCustomers.filter((c) => {
      if (creditOnly && !(c.outstanding_credit > 0)) return false;
      if (!q) return true;
      return (c.full_name ?? "").toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
    });

    rows = [...rows].sort((a, b) => {
      if (sortKey === "spend") return b.total_spent - a.total_spent;
      if (sortKey === "orders") return b.total_orders - a.total_orders;
      if (sortKey === "credit") return b.outstanding_credit - a.outstanding_credit;
      const aTime = a.last_order_at ?? a.created_at;
      const bTime = b.last_order_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    });

    return rows;
  }, [initialCustomers, search, sortKey, creditOnly]);

  const totalOutstandingCredit = useMemo(() => initialCustomers.reduce((sum, c) => sum + Number(c.outstanding_credit), 0), [initialCustomers]);
  const repeatCustomers = useMemo(() => initialCustomers.filter((c) => c.total_orders > 1).length, [initialCustomers]);

  function exportCsv() {
    const csv = toCsv(filtered, [
      { key: "full_name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "total_orders", label: "Total orders" },
      ...(showRevenue ? [{ key: "total_spent" as const, label: "Total spent" }] : []),
      ...(showRevenue ? [{ key: "outstanding_credit" as const, label: "Outstanding credit" }] : []),
      { key: "last_order_at", label: "Last order" },
    ]);
    downloadCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>Customers</h1>
            <InfoTooltip
              items={[
                { color: "var(--brand-dark)", label: "Active", hint: "has placed at least one order" },
                { color: "var(--error)", label: "Outstanding credit", hint: "owed to you — khata/pay-later balance" },
              ]}
            />
          </div>
          <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", marginTop: 4 }}>Everyone who has ordered from you on WhatsApp.</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="Export the customers currently shown to a CSV file"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--surface-border)",
            background: "var(--surface-card)",
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <div style={S.card}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>Total customers</div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>{initialCustomers.length}</div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>Repeat customers</div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>{repeatCustomers}</div>
        </div>
        {showRevenue && (
          <div style={S.card}>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>Outstanding credit</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: totalOutstandingCredit > 0 ? "var(--error)" : "var(--ink)", marginTop: 4 }}>
              ₹{totalOutstandingCredit.toFixed(0)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={14} color="var(--ink-faint)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, or email…" style={{ ...S.input, paddingLeft: 30 }} />
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{ ...S.input, width: "auto" }}>
          <option value="recent">Sort: Most recent order</option>
          <option value="spend">Sort: Highest spend</option>
          <option value="orders">Sort: Most orders</option>
          <option value="credit">Sort: Outstanding credit</option>
        </select>
        {showRevenue && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-base)", color: "var(--ink)", cursor: "pointer" }}>
            <input type="checkbox" checked={creditOnly} onChange={(e) => setCreditOnly(e.target.checked)} />
            Has outstanding credit only
          </label>
        )}
      </div>

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Phone</th>
                <th style={S.th}>Orders</th>
                {showRevenue && <th style={S.th}>Total spent</th>}
                {showRevenue && <th style={S.th}>Credit owed</th>}
                <th style={S.th}>Last order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={showRevenue ? 6 : 4}>
                    {initialCustomers.length === 0 ? (
                      <EmptyState icon={Users} title="No customers yet" description="Everyone who orders from you on WhatsApp will show up here automatically." compact />
                    ) : (
                      <EmptyState icon={Search} title="No customers match your search" compact />
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>
                      <Link href={`/dashboard/customers/${c.id}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                        {c.full_name || "Unnamed customer"}
                      </Link>
                    </td>
                    <td style={S.td}>{c.phone}</td>
                    <td style={S.td}>{c.total_orders}</td>
                    {showRevenue && <td style={{ ...S.td, color: "var(--ink)", fontWeight: 600 }}>₹{Number(c.total_spent).toFixed(0)}</td>}
                    {showRevenue && (
                      <td style={S.td}>
                        {c.outstanding_credit > 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--error)", fontWeight: 600 }}>
                            <CreditCard size={12} /> ₹{Number(c.outstanding_credit).toFixed(0)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-faint)" }}>—</span>
                        )}
                      </td>
                    )}
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      {c.last_order_at ? formatDistanceToNowStrict(new Date(c.last_order_at), { addSuffix: true }) : "Never"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
