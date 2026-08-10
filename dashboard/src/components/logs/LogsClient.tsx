"use client";

import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, ScrollText, Search } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import { ACTION_LABEL, ACTOR_BADGE, actorLabel, type ActorType } from "@/lib/auditLabels";

type LogRow = {
  id: string;
  shop_id: string | null;
  shop_name: string | null;
  actor_type: ActorType;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function DiffRow({ oldValues, newValues }: { oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null }) {
  const keys = Array.from(
    new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})])
  );

  if (keys.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-sm)", fontFamily: "monospace" }}>
      {keys.map((key) => {
        const before = oldValues?.[key];
        const after = newValues?.[key];
        return (
          <div key={key} style={{ color: "var(--ink-muted)" }}>
            <span style={{ color: "var(--ink)" }}>{key}</span>:{" "}
            {oldValues && key in oldValues ? (
              <>
                <span style={{ color: "var(--error)" }}>{formatValue(before)}</span>
                {" → "}
              </>
            ) : null}
            <span style={{ color: "var(--brand-dark)" }}>{formatValue(after)}</span>
          </div>
        );
      })}
    </div>
  );
}

type ShopOption = { id: string; name: string };

export default function LogsClient({
  initialLogs,
  showShopColumn,
  shops,
}: {
  initialLogs: LogRow[];
  showShopColumn: boolean;
  shops?: ShopOption[] | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [category, setCategory] = useState<"all" | "admin" | "shop">("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const logs = useMemo(
    () =>
      initialLogs.filter((row) => {
        if (shopFilter !== "all" && row.shop_id !== shopFilter) return false;
        if (category === "admin" && row.actor_type !== "super_admin") return false;
        if (category === "shop" && row.actor_type === "super_admin") return false;

        const rowDate = row.created_at.slice(0, 10);
        if (dateFrom && rowDate < dateFrom) return false;
        if (dateTo && rowDate > dateTo) return false;

        const q = search.trim().toLowerCase();
        if (q) {
          const actorName = (row.metadata?.actor_name as string | undefined) ?? "";
          const targetName = (row.metadata?.target_name as string | undefined) ?? row.entity_type;
          const haystack = [
            actorLabel(row.actor_type),
            actorName,
            ACTION_LABEL[row.action] ?? row.action,
            row.action,
            targetName,
            row.shop_name ?? "",
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      }),
    [initialLogs, shopFilter, category, search, dateFrom, dateTo],
  );

  const columnCount = useMemo(() => (showShopColumn ? 5 : 4), [showShopColumn]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>
            {showShopColumn ? "Audit Logs" : "Activity Logs"}
          </h1>
          <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", marginTop: 4 }}>
            {showShopColumn
              ? "Platform-wide record of shop and staff changes."
              : "Record of staff and account changes for this shop."}
          </p>
        </div>

        {showShopColumn && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ink-muted)", marginBottom: 4, fontWeight: 600 }}>
                Category
              </label>
              <div style={{ display: "flex", borderRadius: 8, padding: 3, background: "var(--surface)", border: "1px solid var(--surface-border)", gap: 2 }}>
                {(
                  [
                    { value: "all", label: "All" },
                    { value: "admin", label: "Admin logs" },
                    { value: "shop", label: "Shop logs" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCategory(opt.value)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      border: "none",
                      background: category === opt.value ? "#FFFFFF" : "transparent",
                      color: category === opt.value ? "var(--brand-dark)" : "var(--ink-muted)",
                      boxShadow: category === opt.value ? "0 1px 3px rgba(11,28,48,0.08)" : "none",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {shops && shops.length > 0 && (
              <div>
                <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ink-muted)", marginBottom: 4, fontWeight: 600 }}>
                  Filter by shop
                </label>
                <select
                  value={shopFilter}
                  onChange={(e) => setShopFilter(e.target.value)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--surface-border)",
                    background: "#FFFFFF",
                    color: "var(--ink)",
                    fontSize: "var(--text-base)",
                    fontFamily: "inherit",
                    minWidth: 200,
                  }}
                >
                  <option value="all">All shops</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ink-muted)", marginBottom: 4, fontWeight: 600 }}>Search</label>
          <Search size={14} color="var(--ink-faint)" style={{ position: "absolute", left: 10, top: 30, transform: "translateY(-50%)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Actor, action, or target…"
            style={{ ...S.input, paddingLeft: 30 }}
          />
        </div>
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
        {(search || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
            }}
            style={S.btn("var(--surface-hover)", "var(--ink)")}
          >
            Clear filters
          </button>
        )}
      </div>

      <div style={S.card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>When</th>
                <th style={S.th}>Actor</th>
                <th style={S.th}>Action</th>
                {showShopColumn && <th style={S.th}>Shop</th>}
                <th style={S.th}>Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={columnCount}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-muted)" }}>
                      <ScrollText size={14} />
                      {initialLogs.length === 0 ? "No activity recorded yet." : "No activity matches your filters."}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((row) => {
                  const [color, background] = ACTOR_BADGE[row.actor_type] ?? ACTOR_BADGE.system;
                  const actorNameFromMetadata = row.metadata?.actor_name as string | undefined;
                  // Always include the role — two staff members can share a
                  // first name, and the role alone (without a name) reads
                  // ambiguously once a shop has more than one of each role.
                  const actorName = actorNameFromMetadata
                    ? `${actorNameFromMetadata} · ${actorLabel(row.actor_type)}`
                    : actorLabel(row.actor_type);
                  const targetName = (row.metadata?.target_name as string | undefined) ?? row.entity_type;
                  const expanded = expandedId === row.id;
                  const hasDetails = Boolean(row.old_values || row.new_values);

                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => hasDetails && setExpandedId(expanded ? null : row.id)}
                        style={{ cursor: hasDetails ? "pointer" : "default" }}
                      >
                        <td style={{ ...S.td, whiteSpace: "nowrap", color: "var(--ink-muted)" }}>
                          {format(new Date(row.created_at), "MMM d, HH:mm:ss")}
                        </td>
                        <td style={S.td}>
                          <span style={S.badge(color, background)}>{actorName}</span>
                        </td>
                        <td style={{ ...S.td, color: "var(--ink)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {hasDetails &&
                              (expanded ? <ChevronDown size={13} color="var(--ink-muted)" /> : <ChevronRight size={13} color="var(--ink-muted)" />)}
                            {ACTION_LABEL[row.action] ?? row.action}
                          </div>
                        </td>
                        {showShopColumn && <td style={S.td}>{row.shop_name ?? "—"}</td>}
                        <td style={S.td}>{targetName}</td>
                      </tr>
                      {expanded && hasDetails && (
                        <tr>
                          <td colSpan={columnCount} style={{ ...S.td, background: "#F7F8FA" }}>
                            <DiffRow oldValues={row.old_values} newValues={row.new_values} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
