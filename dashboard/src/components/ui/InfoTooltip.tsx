"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

// Compact "?" affordance placed next to a page title — hover (or tap) to
// see what each status color/action on the page means, instead of a
// permanent legend strip eating vertical space on every page.
export default function InfoTooltip({
  items,
}: {
  items: { color: string; label: string; hint?: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="What do these statuses mean?"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid var(--surface-border)",
          background: "#FFFFFF",
          color: "var(--ink-faint)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <HelpCircle size={13} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 30,
            minWidth: 240,
            background: "#FFFFFF",
            border: "1px solid var(--surface-border)",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(11,28,48,0.12)",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {items.map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 3 }} />
              <div>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{item.label}</span>
                {item.hint && <span style={{ color: "var(--ink-muted)" }}> — {item.hint}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
