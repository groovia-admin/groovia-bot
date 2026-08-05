"use client";

import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";

type ActorType = "super_admin" | "owner" | "manager" | "staff" | "system" | "whatsapp" | "ai";

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

const ACTION_LABEL: Record<string, string> = {
  "staff.created": "Staff member added",
  "staff.role_changed": "Staff role changed",
  "staff.activated": "Staff member reactivated",
  "staff.deactivated": "Staff member deactivated",
  "staff.updated": "Staff member updated",
  "shop.created": "Shop created",
  "shop.activated": "Shop activated",
  "shop.deactivated": "Shop deactivated",
  "shop.subscription_updated": "Subscription status updated",
  "shop.updated": "Shop updated",
  "settings.updated": "Shop settings updated",
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "shop.logo_updated": "Shop logo updated",
};

const ACTOR_BADGE: Record<ActorType, [string, string]> = {
  super_admin: ["#3b82f6", "rgba(59,130,246,0.12)"],
  owner: ["#a78bfa", "rgba(167,139,250,0.12)"],
  manager: ["#38bdf8", "rgba(56,189,248,0.12)"],
  staff: ["#94a3b8", "rgba(148,163,184,0.12)"],
  system: ["#facc15", "rgba(250,204,21,0.12)"],
  whatsapp: ["#22c55e", "rgba(34,197,94,0.12)"],
  ai: ["#f472b6", "rgba(244,114,182,0.12)"],
};

const S = {
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 0,
    overflow: "hidden",
  } as React.CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#64748b",
    fontWeight: 600,
    borderBottom: "1px solid #334155",
  } as React.CSSProperties,
  td: {
    padding: "12px 16px",
    fontSize: 13,
    color: "#94a3b8",
    borderBottom: "1px solid rgba(30,41,59,0.8)",
    verticalAlign: "top",
  } as React.CSSProperties,
  badge: (color: string, background: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      color,
      background,
      border: `1px solid ${color}33`,
    }) as React.CSSProperties,
};

function actorLabel(actorType: ActorType) {
  return actorType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontFamily: "monospace" }}>
      {keys.map((key) => {
        const before = oldValues?.[key];
        const after = newValues?.[key];
        return (
          <div key={key} style={{ color: "#64748b" }}>
            <span style={{ color: "#94a3b8" }}>{key}</span>:{" "}
            {oldValues && key in oldValues ? (
              <>
                <span style={{ color: "#f87171" }}>{formatValue(before)}</span>
                {" → "}
              </>
            ) : null}
            <span style={{ color: "#4ade80" }}>{formatValue(after)}</span>
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

  const logs = useMemo(
    () => (shopFilter === "all" ? initialLogs : initialLogs.filter((row) => row.shop_id === shopFilter)),
    [initialLogs, shopFilter],
  );

  const columnCount = useMemo(() => (showShopColumn ? 5 : 4), [showShopColumn]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>
            {showShopColumn ? "Audit Logs" : "Activity Logs"}
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {showShopColumn
              ? "Platform-wide record of shop and staff changes."
              : "Record of staff and account changes for this shop."}
          </p>
        </div>

        {showShopColumn && shops && shops.length > 0 && (
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>
              Filter by shop
            </label>
            <select
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#f1f5f9",
                fontSize: 13,
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b" }}>
                      <ScrollText size={14} />
                      No activity recorded yet.
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((row) => {
                  const [color, background] = ACTOR_BADGE[row.actor_type] ?? ACTOR_BADGE.system;
                  const actorName = (row.metadata?.actor_name as string | undefined) ?? actorLabel(row.actor_type);
                  const targetName = (row.metadata?.target_name as string | undefined) ?? row.entity_type;
                  const expanded = expandedId === row.id;
                  const hasDetails = Boolean(row.old_values || row.new_values);

                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => hasDetails && setExpandedId(expanded ? null : row.id)}
                        style={{ cursor: hasDetails ? "pointer" : "default" }}
                      >
                        <td style={{ ...S.td, whiteSpace: "nowrap", color: "#64748b" }}>
                          {format(new Date(row.created_at), "MMM d, HH:mm")}
                        </td>
                        <td style={S.td}>
                          <span style={S.badge(color, background)}>{actorName}</span>
                        </td>
                        <td style={{ ...S.td, color: "#f1f5f9" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {hasDetails &&
                              (expanded ? <ChevronDown size={13} color="#64748b" /> : <ChevronRight size={13} color="#64748b" />)}
                            {ACTION_LABEL[row.action] ?? row.action}
                          </div>
                        </td>
                        {showShopColumn && <td style={S.td}>{row.shop_name ?? "—"}</td>}
                        <td style={S.td}>{targetName}</td>
                      </tr>
                      {expanded && hasDetails && (
                        <tr>
                          <td colSpan={columnCount} style={{ ...S.td, background: "#161f30" }}>
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
