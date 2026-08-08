"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Search, Users, CreditCard } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import InfoTooltip from "@/components/ui/InfoTooltip";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111B21", margin: 0 }}>Customers</h1>
          <InfoTooltip
            items={[
              { color: "#128C7E", label: "Active", hint: "has placed at least one order" },
              { color: "#C0392B", label: "Outstanding credit", hint: "owed to you — khata/pay-later balance" },
            ]}
          />
        </div>
        <p style={{ fontSize: 13, color: "#667781", marginTop: 4 }}>Everyone who has ordered from you on WhatsApp.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <div style={S.card}>
          <div style={{ fontSize: 12, color: "#667781" }}>Total customers</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111B21", marginTop: 4 }}>{initialCustomers.length}</div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 12, color: "#667781" }}>Repeat customers</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111B21", marginTop: 4 }}>{repeatCustomers}</div>
        </div>
        {showRevenue && (
          <div style={S.card}>
            <div style={{ fontSize: 12, color: "#667781" }}>Outstanding credit</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalOutstandingCredit > 0 ? "#C0392B" : "#111B21", marginTop: 4 }}>
              ₹{totalOutstandingCredit.toFixed(0)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={14} color="#8696A0" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, or email…" style={{ ...S.input, paddingLeft: 30 }} />
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{ ...S.input, width: "auto" }}>
          <option value="recent">Sort: Most recent order</option>
          <option value="spend">Sort: Highest spend</option>
          <option value="orders">Sort: Most orders</option>
          <option value="credit">Sort: Outstanding credit</option>
        </select>
        {showRevenue && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#111B21", cursor: "pointer" }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#667781" }}>
                      <Users size={14} />
                      {initialCustomers.length === 0 ? "No customers yet." : "No customers match your search."}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...S.td, color: "#111B21", fontWeight: 500 }}>
                      <Link href={`/dashboard/customers/${c.id}`} style={{ color: "#111B21", textDecoration: "none" }}>
                        {c.full_name || "Unnamed customer"}
                      </Link>
                    </td>
                    <td style={S.td}>{c.phone}</td>
                    <td style={S.td}>{c.total_orders}</td>
                    {showRevenue && <td style={{ ...S.td, color: "#111B21", fontWeight: 600 }}>₹{Number(c.total_spent).toFixed(0)}</td>}
                    {showRevenue && (
                      <td style={S.td}>
                        {c.outstanding_credit > 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#C0392B", fontWeight: 600 }}>
                            <CreditCard size={12} /> ₹{Number(c.outstanding_credit).toFixed(0)}
                          </span>
                        ) : (
                          <span style={{ color: "#8696A0" }}>—</span>
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
