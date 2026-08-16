"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";

export type SortDir = "asc" | "desc";

// Shared clickable, direction-indicating <th> — every sortable table in the
// dashboard (Orders, Products, Reports) renders through this so a
// click-to-sort column looks and behaves identically everywhere.
export default function SortableTh({
  label,
  active,
  dir,
  align,
  width,
  sticky,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right" | "center";
  width?: number | string;
  // Pins the header row to the top of the page while scrolling a long
  // table — needs an opaque background so body rows don't show through
  // underneath it once it's stuck.
  sticky?: boolean;
  onClick: () => void;
}) {
  return (
    <th
      style={{
        ...S.th,
        textAlign: align ?? "left",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        width,
        ...(sticky ? { position: "sticky" as const, top: 0, background: "#FFFFFF", zIndex: 1 } : null),
      }}
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: align === "center" ? "center" : "flex-start", width: align === "center" ? "100%" : undefined, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {label}
        {active ? (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span style={{ width: 12, display: "inline-block" }} />}
      </span>
    </th>
  );
}
