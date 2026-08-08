"use client";

import { Clock } from "lucide-react";
import { getOrderAgeMinutes, getAgingLevel, formatAgeShort, AGING_COLOR } from "@/lib/orderAging";

// `now` is passed in (ticked by the parent list, not this component) so
// every row in a table re-renders off one shared interval instead of each
// row running its own timer.
export default function OrderAgeBadge({ createdAt, now }: { createdAt: string; now: Date }) {
  const minutes = getOrderAgeMinutes(createdAt, now);
  const level = getAgingLevel(minutes);
  const { color, background } = AGING_COLOR[level];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color,
        background,
      }}
      title={level === "urgent" ? "Waiting a while — worth checking on" : level === "warning" ? "Getting close to needing attention" : "Recently placed"}
    >
      <Clock size={11} />
      {formatAgeShort(minutes)}
    </span>
  );
}
